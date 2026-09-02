import { MMKV } from 'react-native-mmkv'
import type { AdaptedTransaction } from './adaptTransaction'

/**
 * On-device storage for FinanceKit data. Deliberately its own MMKV instance rather than a section
 * of `tofi-transaction-cache`: the Plaid cache has its own cursor and prune logic that must stay
 * untouched, and revoking Wallet access has to be able to drop everything FinanceKit-derived
 * without disturbing Plaid's rows.
 *
 * Nothing here is ever transmitted. The FinanceKit entitlement request states that Apple Card,
 * Apple Cash, and Savings data stays on the device, so this module is the end of the line for it.
 */
const storage = new MMKV({ id: 'tofi-financekit' })

const LAST_SYNCED_AT_KEY = 'last-synced-at'
const SCHEMA_VERSION_KEY = 'schema-version'
const txnKey = (accountId: string) => `txns:${accountId}`

/**
 * Bump whenever AdaptedTransaction's shape or semantics change.
 *
 * This cache holds *adapted* rows, so a change to adaptTransaction does not reach anything already
 * stored — only rows the next trailing window happens to re-fetch. That is how a date-format fix
 * left every older transaction still rendering a raw ISO timestamp. On a mismatch everything is
 * dropped, including the watermark, so the next sync re-reads and re-adapts from scratch.
 *
 * 2 — `date` narrowed to YYYY-MM-DD, `transactionDate` added for window partitioning.
 */
const SCHEMA_VERSION = 2

/**
 * Call before any read. Cheap: one integer comparison against MMKV.
 */
export function ensureSchemaCurrent(): void {
  if (storage.getNumber(SCHEMA_VERSION_KEY) === SCHEMA_VERSION) return
  storage.clearAll()
  storage.set(SCHEMA_VERSION_KEY, SCHEMA_VERSION)
}

/**
 * ISO timestamp of the last successful sync, or null if there has never been one.
 *
 * This is a watermark, not a cursor: expo-finance-kit exposes no history token, so the sync
 * re-reads a trailing window computed from this value. Null means "read everything".
 */
export function getLastSyncedAt(): string | null {
  return storage.getString(LAST_SYNCED_AT_KEY) ?? null
}

export function setLastSyncedAt(iso: string): void {
  storage.set(LAST_SYNCED_AT_KEY, iso)
}

export function getCachedTransactions(accountId: string): AdaptedTransaction[] {
  const raw = storage.getString(txnKey(accountId))
  return raw ? (JSON.parse(raw) as AdaptedTransaction[]) : []
}

export function setCachedTransactions(accountId: string, txns: AdaptedTransaction[]): void {
  storage.set(txnKey(accountId), JSON.stringify(txns))
}

/**
 * Drops every FinanceKit record and the watermark. Called when access is revoked or the user removes
 * their Apple accounts — leaving the watermark behind would make a later re-grant re-read only a
 * trailing window and silently miss everything that happened while access was off.
 */
export function clearFinanceKitData(): void {
  storage.clearAll()
  // Re-stamped so the next read does not treat the deliberate clear as a stale-schema clear.
  storage.set(SCHEMA_VERSION_KEY, SCHEMA_VERSION)
}
