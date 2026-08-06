import type { FeedItem } from '@/lib/transactions/resolveFeed'
import { round2 } from './netWorth'

/**
 * Net worth history is *back-cast* from today's balances rather than read from stored
 * snapshots — balances are fetched live from Plaid and never persisted (architecture.md),
 * so there is no historical series to query.
 *
 * The walk relies on one invariant: for any Plaid transaction, `amount` is positive when
 * money leaves the account. On a depository account a $100 debit drops the balance by 100;
 * on a credit account a $100 purchase raises the amount owed by 100. Net worth subtracts
 * liabilities, so both move net worth by `-amount` — which also makes transfers cancel out
 * (the $50 leaving checking and the $50 paid off the card sum to zero).
 *
 * So: netWorth(end of month M-1) = netWorth(end of month M) - change(M), where
 * change(M) = -sum(amount) over M. Starting from today's net worth, that walks backwards.
 *
 * Manual transactions count on exactly the same terms. `computeCashOnHand` treats them as a
 * cash pot inside totalAssets, so the anchor this walks back from already contains them, and
 * a manual expense unwinds to a real past cash balance rather than to an offset from today.
 * The pot's zero point (before the first manual entry) is what makes that exact.
 *
 * One limit remains, inherent to reconstructing from a ledger: investment accounts hold their
 * present value across every past month. /transactions/sync reports cash activity, not
 * holdings or market movement, so there is nothing to unwind.
 *
 * One thing to be aware of rather than a limit: cash withdrawn from a linked account and then
 * logged as a manual expense moves the line twice — once as the ATM debit Plaid saw, once as
 * the manual entry. That is correct under this model (the withdrawal moved money from bank to
 * wallet; the manual entry then spent it) only if the withdrawal itself was logged as cash
 * income too. The app's spend totals already double-count that pair, so this stays consistent
 * with them either way.
 */
export interface MonthPoint {
  year: number
  month: number // 1-12
  netWorth: number
  /** Net worth movement during this month — netWorth minus the previous month's. */
  change: number
}

function toIndex(year: number, month: number): number {
  return year * 12 + (month - 1)
}

function fromIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** Monthly net flow, keyed by absolute month index, over every transaction that moved money. */
function flowByMonth(feed: FeedItem[], linkedAccountIds: Set<string>): Map<number, number> {
  const flow = new Map<number, number>()
  for (const item of feed) {
    // Manual transactions have no accountId by design and are always counted. Plaid ones are
    // dropped when their account is no longer linked: that balance left the net worth total
    // when the institution was removed, so its history would be unwinding a phantom.
    if (item.source === 'plaid' && (!item.accountId || !linkedAccountIds.has(item.accountId))) continue
    const year = Number(item.date.slice(0, 4))
    const month = Number(item.date.slice(5, 7))
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) continue
    // Gross `amount`, not `netAmount`: a reimbursement's income transaction is its own feed
    // item, so netting it out here would count the same dollars twice.
    const index = toIndex(year, month)
    flow.set(index, (flow.get(index) ?? 0) + item.amount)
  }
  return flow
}

/**
 * Net worth at the end of each month of `year`, ascending. Months earlier than the oldest
 * synced transaction are omitted rather than flat-lined — with no ledger to unwind, their
 * value is unknown, not unchanged.
 */
export function computeNetWorthHistory(
  currentNetWorth: number,
  feed: FeedItem[],
  linkedAccountIds: Set<string>,
  year: number,
  today: Date = new Date(),
): MonthPoint[] {
  const nowIndex = toIndex(today.getFullYear(), today.getMonth() + 1)
  const flow = flowByMonth(feed, linkedAccountIds)

  let earliestIndex = nowIndex
  for (const index of flow.keys()) {
    if (index < earliestIndex) earliestIndex = index
  }

  const requestedFirst = toIndex(year, 1)
  const requestedLast = toIndex(year, 12)
  if (requestedFirst > nowIndex || requestedLast < earliestIndex) return []

  // Walk back from today one month at a time, keeping only what lands in `year`.
  const points: MonthPoint[] = []
  let running = currentNetWorth
  for (let index = nowIndex; index >= earliestIndex; index--) {
    const change = -(flow.get(index) ?? 0)
    if (index >= requestedFirst && index <= requestedLast) {
      points.push({ ...fromIndex(index), netWorth: round2(running), change: round2(change) })
    }
    running -= change
  }

  return points.reverse()
}

/** Years the history can cover: from the oldest synced transaction through the current year. */
export function netWorthYearRange(
  feed: FeedItem[],
  linkedAccountIds: Set<string>,
  today: Date = new Date(),
): { first: number; last: number } {
  const last = today.getFullYear()
  let first = last
  for (const index of flowByMonth(feed, linkedAccountIds).keys()) {
    const { year } = fromIndex(index)
    if (year < first) first = year
  }
  return { first, last }
}
