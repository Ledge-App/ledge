import { adaptAccount, type AdaptedAccount } from './adaptAccount'
import { adaptTransaction, type AdaptedTransaction } from './adaptTransaction'
import { ensureFinanceKitAccess } from './permission'
import { planWindowedMerge } from './planWindowedMerge'
import {
  clearFinanceKitData,
  ensureSchemaCurrent,
  getCachedTransactions,
  getLastSyncedAt,
  setCachedTransactions,
  setLastSyncedAt,
} from './store'
import type { AuthorizationStatus, RawAccount, RawBalance, RawTransaction } from './types'

/**
 * The bridge surface, injected rather than imported, so every path here is testable without a
 * device. Implemented by financeKitModule.ts over expo-finance-kit.
 */
export interface FinanceKitModule {
  isDataAvailable: () => boolean
  authorizationStatus: () => Promise<AuthorizationStatus>
  requestAuthorization: () => Promise<AuthorizationStatus>
  fetchAccounts: () => Promise<RawAccount[]>
  fetchBalances: () => Promise<RawBalance[]>
  /** Every transaction dated at or after `since`. Null means the whole available history. */
  fetchTransactions: (since: string | null) => Promise<RawTransaction[]>
}

export type FinanceKitSyncStatus = AuthorizationStatus | 'unavailable'

export interface FinanceKitSyncResult {
  status: FinanceKitSyncStatus
  accounts: AdaptedAccount[]
}

/**
 * How far back before the last watermark each sync re-reads.
 *
 * A charge can post days after it was authorized, and Apple Card statement credits appear later
 * still — both change rows already behind the previous watermark. Re-reading a week costs one query
 * over a handful of rows and makes those corrections land, which a strict `since watermark` read
 * would miss forever.
 */
const OVERLAP_DAYS = 7

/**
 * How far back the very first sync reads.
 *
 * Unbounded was the default and it is expensive: FinanceKit returns the account's whole history in
 * one call, and everything downstream — the MMKV write, the crosswalk pass, the feed array — is
 * sized by the total, not by the window, so a large import makes every later 7-day sync do
 * full-history work. Two years covers every month-scoped surface the app has.
 */
const INITIAL_WINDOW_MONTHS = 24

const NOTHING = (status: FinanceKitSyncStatus): FinanceKitSyncResult => ({ status, accounts: [] })

function windowStartFrom(lastSyncedAt: string | null, now: Date): string {
  if (!lastSyncedAt) {
    const start = new Date(now)
    start.setUTCMonth(start.getUTCMonth() - INITIAL_WINDOW_MONTHS)
    return start.toISOString()
  }
  const start = new Date(lastSyncedAt)
  start.setUTCDate(start.getUTCDate() - OVERLAP_DAYS)
  return start.toISOString()
}

/**
 * Reads Apple Card, Apple Cash, and Savings data and merges it into on-device storage.
 *
 * Accounts and balances are re-read in full every run — there are at most three, so a full read
 * costs less than tracking them incrementally and a balance change can never be missed.
 * Transactions come from a trailing window (see OVERLAP_DAYS) because expo-finance-kit exposes no
 * history token; planWindowedMerge treats that window as authoritative.
 *
 * `requestIfNeeded` is off by default: a sync triggered by app launch or pull-to-refresh must never
 * raise a permission prompt the user did not ask for. Only the explicit "Add Apple Card" action
 * passes it.
 */
export async function runFinanceKitSync(
  financeKit: FinanceKitModule,
  options: { requestIfNeeded?: boolean; now?: Date } = {},
): Promise<FinanceKitSyncResult> {
  if (!financeKit.isDataAvailable()) return NOTHING('unavailable')

  // Before any read: a cache written by an older AdaptedTransaction shape is dropped rather than
  // half-migrated by the trailing window.
  ensureSchemaCurrent()

  const status = await ensureFinanceKitAccess(financeKit, { canPrompt: options.requestIfNeeded ?? false })

  if (status !== 'authorized') {
    // Revoked or never granted. Clearing is unconditional rather than guarded on "did we have
    // data": a watermark left behind would make a later re-grant resume mid-history.
    clearFinanceKitData()
    return NOTHING(status)
  }

  const [rawAccounts, rawBalances] = await Promise.all([financeKit.fetchAccounts(), financeKit.fetchBalances()])
  const balanceByAccount = new Map(rawBalances.map((balance) => [balance.accountID, balance]))
  const accounts = rawAccounts.map((raw) => adaptAccount(raw, balanceByAccount.get(raw.id)))

  const now = options.now ?? new Date()
  const windowStart = windowStartFrom(getLastSyncedAt(), now)
  const fetched = await financeKit.fetchTransactions(windowStart)

  const fetchedByAccount = new Map<string, AdaptedTransaction[]>()
  for (const raw of fetched) {
    const adapted = adaptTransaction(raw)
    const forAccount = fetchedByAccount.get(adapted.account_id) ?? []
    forAccount.push(adapted)
    fetchedByAccount.set(adapted.account_id, forAccount)
  }

  // Iterating accounts rather than the fetched rows on purpose: an account that returned nothing
  // still needs the window applied, otherwise a transaction the user deleted in Wallet would
  // linger in the cache forever.
  for (const account of accounts) {
    const merged = planWindowedMerge(
      getCachedTransactions(account.account_id),
      fetchedByAccount.get(account.account_id) ?? [],
      windowStart,
    )
    setCachedTransactions(account.account_id, merged)
  }

  // Advanced only after every merge has landed, so a thrown read or write replays the same window
  // next time instead of skipping it.
  setLastSyncedAt(now.toISOString())

  return { status, accounts }
}
