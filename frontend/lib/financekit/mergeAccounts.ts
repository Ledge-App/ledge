import type { AdaptedAccount } from './adaptAccount'
import type { FinanceKitSyncResult } from './syncEngine'

/**
 * The synthetic itemId every FinanceKit account carries. It exists so account ordering, institution
 * grouping, and the item-error channel need no special cases — but it is not a Plaid item, so it
 * must never reach a Plaid call site. Use plaidItemIdsFrom wherever itemIds feed Plaid.
 */
export const FINANCEKIT_ITEM_ID = 'financekit'

/**
 * An unreachable-institution notice. `kind` exists because the accounts screen offers a repair
 * action on these rows, and repair means Plaid Link update mode — meaningless for Apple Card, whose
 * only remedy is iOS Settings. Reusing the array is what gives FinanceKit free rendering and free
 * exclusion from the feed (TransactionFeedProvider already skips accounts whose itemId errored);
 * the discriminator is what stops that reuse from offering a broken button.
 */
export interface MergedItemError {
  itemId: string
  institutionName: string
  message: string
  kind: 'plaid' | 'financekit'
}

interface BackendAccounts<A> {
  accounts: A[]
  itemErrors: { itemId: string; institutionName: string; message: string }[]
}

export interface MergedAccounts<A> {
  accounts: (A | AdaptedAccount)[]
  itemErrors: MergedItemError[]
}

/**
 * Folds the FinanceKit sync result into what the backend returned.
 *
 * Only `denied` and `restricted` produce a notice. `unavailable` means the device cannot supply the
 * data at all and `notDetermined` means the user was never asked — neither is a fault to report, and
 * surfacing them would put a permanent warning on the accounts screen of every user who does not
 * have an Apple Card.
 */
export function mergeFinanceKitIntoAccounts<A>(
  backend: BackendAccounts<A>,
  financeKit: FinanceKitSyncResult | null,
): MergedAccounts<A> {
  const itemErrors: MergedItemError[] = backend.itemErrors.map((error) => ({ ...error, kind: 'plaid' }))

  if (!financeKit) return { accounts: [...backend.accounts], itemErrors }

  if (financeKit.status === 'denied' || financeKit.status === 'restricted') {
    itemErrors.push({
      itemId: FINANCEKIT_ITEM_ID,
      institutionName: 'Apple',
      message: 'ToFi no longer has access to your Apple accounts.',
      kind: 'financekit',
    })
  }

  return { accounts: [...backend.accounts, ...financeKit.accounts], itemErrors }
}

/**
 * The distinct Plaid itemIds among a merged account list.
 *
 * TransactionFeedProvider derives itemIds from accounts and hands them to syncDriver.syncNow,
 * useInvestmentTransactions, planCachePrune, and the Plaid MMKV cache. Letting the FinanceKit
 * itemId through would make the driver sync a non-existent Plaid item and make the prune reason
 * about a cache that does not exist — silently, on every launch. Hence the filter has its own test.
 */
export function plaidItemIdsFrom(accounts: { itemId: string }[]): string[] {
  return [...new Set(accounts.map((account) => account.itemId))].filter((id) => id !== FINANCEKIT_ITEM_ID)
}
