import type { FeedItem } from '@/lib/transactions/resolveFeed'

/**
 * Which feed items may be offered as the other leg when marking `item` as a transfer of any kind.
 * The per-kind rules (amount tolerance, date window, account) live in the registry's `matches`;
 * this is the floor every kind shares — an item that can't be a counterpart at all.
 *
 * Excluded:
 *  - the same sign as `item`, which can't be an opposing leg (and `item` itself);
 *  - anything already committed to a transfer, which can't join a second one;
 *  - an income already spent on a reimbursement. Reimbursements are one income to one expense;
 *    offering that income again would split it across two expenses and over-credit both. An
 *    expense already partly reimbursed stays on offer — several incomes may pay one expense back.
 */
export function transferCandidates(feed: FeedItem[], item: FeedItem): FeedItem[] {
  const wantExpense = item.amount < 0
  return feed.filter((candidate) => {
    if (candidate.id === item.id) return false
    if (wantExpense ? candidate.amount <= 0 : candidate.amount >= 0) return false
    if (candidate.transferKind !== null) return false
    if (candidate.isReimbursementIncome) return false
    return true
  })
}
