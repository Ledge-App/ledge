import { countsTowardTotals } from './totals'
import type { FeedItem } from './resolveFeed'

export interface DayTotals {
  income: number
  expense: number
}

/**
 * One day's IN/OUT split, as every day header renders it — the Transactions tab, the account
 * sheet and the category sheet all call this rather than reducing the rows themselves, so a day
 * can't read as $15.15 on one screen and $301.15 on another.
 *
 * Filters on countsTowardTotals, the same predicate that greys a row's amount out: a day whose
 * only rows are excluded comes back {0, 0}, which is what lets the header say so plainly instead
 * of claiming spend the greyed rows below it don't have.
 *
 * Both figures are positive magnitudes; the sign lives in which field the money landed in.
 */
export function dayTotals(items: FeedItem[]): DayTotals {
  let income = 0
  let expense = 0
  for (const item of items) {
    if (!countsTowardTotals(item)) continue
    // Sign off the raw amount, magnitude off the net: a reimbursed expense is still an expense,
    // and it's the netted figure the user actually paid.
    if (item.amount < 0) income += Math.abs(item.netAmount ?? item.amount)
    else expense += item.netAmount ?? item.amount
  }
  return { income, expense }
}
