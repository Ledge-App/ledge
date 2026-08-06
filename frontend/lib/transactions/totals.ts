import type { FeedItem } from './resolveFeed'

/** Either leg of a transfer — the expense side or the linked income side. */
export function isTransfer(item: FeedItem): boolean {
  return item.transferKind !== null
}

// Single predicate for "does this item belong in spend/income aggregates", so the donut, top
// merchants, the daily chart and the per-day IN/OUT rows can never disagree about what counts.
//
// Excluded:
//  - a reimbursement's income leg, already netted out of its expense — counting it double-credits;
//  - both legs of a transfer, which is money moved between the user's own accounts, not spending
//    or income. Unpaired transfers are excluded too: the money still didn't leave the user.
export function countsTowardTotals(item: FeedItem): boolean {
  return !item.isReimbursementIncome && !isTransfer(item)
}
