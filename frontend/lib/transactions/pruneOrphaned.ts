import type { PlaidTransaction } from '@/types/domain'

export interface PrunePlanInput {
  /** Every item with a cache worth checking. */
  itemIds: string[]
  cachedByItem: Map<string, PlaidTransaction[]>
  /** Accounts Plaid currently returns, grouped by item. Absent = the item returned none. */
  liveAccountIdsByItem: Map<string, Set<string>>
  /** Items whose accounts could not be loaded this round (accounts.list itemErrors). */
  failedItemIds: Set<string>
}

/**
 * Works out which cached transactions no longer belong to any account the app can still see.
 *
 * Update mode lets a connection change shape rather than be replaced: deselecting a card in
 * Plaid's account-selection screen leaves the Item, the access token and every other account
 * intact. Plaid states only that de-selected accounts "will no longer be shared with you" and
 * recommends the developer "remove any data associated with accounts that your user has
 * de-selected" — it does not retract their transactions through /transactions/sync. So this is
 * the only thing that evicts them; without it they sit in the feed forever.
 *
 * Items in `failedItemIds` are skipped entirely. A transient failure — an expired login, a Plaid
 * outage — makes an item's accounts momentarily invisible, which is indistinguishable from
 * deselection by account id alone. Treating it as deselection would delete a working item's
 * whole history on a blip, so a failed item is left exactly as it is.
 *
 * Returns only the items whose cache actually changed, so callers can skip needless writes.
 */
export function planCachePrune({
  itemIds,
  cachedByItem,
  liveAccountIdsByItem,
  failedItemIds,
}: PrunePlanInput): Map<string, PlaidTransaction[]> {
  const plan = new Map<string, PlaidTransaction[]>()

  for (const itemId of itemIds) {
    if (failedItemIds.has(itemId)) continue

    const cached = cachedByItem.get(itemId)
    if (!cached || cached.length === 0) continue

    const liveAccountIds = liveAccountIdsByItem.get(itemId) ?? new Set<string>()
    const kept = cached.filter((transaction) => liveAccountIds.has(transaction.account_id))
    if (kept.length !== cached.length) plan.set(itemId, kept)
  }

  return plan
}
