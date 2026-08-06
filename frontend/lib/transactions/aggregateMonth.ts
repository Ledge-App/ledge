import { isTransfer } from './totals'
import type { FeedItem } from './resolveFeed'

export interface MonthAggregate {
  spendByCategory: Map<string, number>
  incomeByCategory: Map<string, number>
  spendByDay: Map<string, { net: number; hasReimbursement: boolean }>
  totalExpense: number
  totalIncome: number
}

// Single source of truth for "how do we turn a (month+account-filtered) feed into
// spend/income aggregates" — every screen that shows these numbers must call this,
// not reimplement its own version, so Dashboard/Budgets/Transactions never drift.
//
// Two conventions are fixed here deliberately:
//  - items are classified as expense/income by the sign of their NET amount (post
//    reimbursement), matching what the Transactions calendar always showed;
//  - uncategorized items DO count toward totalExpense/totalIncome and are only left
//    out of the per-category maps, since a running total that silently drops
//    uncategorized spend understates what the user actually spent.
export function aggregateMonth(feed: FeedItem[]): MonthAggregate {
  const spendByCategory = new Map<string, number>()
  const incomeByCategory = new Map<string, number>()
  const spendByDay = new Map<string, { net: number; hasReimbursement: boolean }>()
  let totalExpense = 0
  let totalIncome = 0

  for (const item of feed) {
    // Both legs of a transfer are money moved between the user's own accounts. Unlike a
    // reimbursement's income leg below, neither leg marks the calendar day either — there is
    // nothing about the day for the user to notice.
    if (isTransfer(item)) continue

    const net = item.netAmount ?? item.amount
    const existingDay = spendByDay.get(item.date) ?? { net: 0, hasReimbursement: false }
    const hasReimbursement = existingDay.hasReimbursement || item.reimbursedAmount != null || item.isReimbursementIncome

    // A reimbursement's income leg is already netted out of its expense, so counting it
    // again would double-credit it — it only marks the day as reimbursement-touched.
    if (item.isReimbursementIncome) {
      spendByDay.set(item.date, { net: existingDay.net, hasReimbursement })
      continue
    }

    spendByDay.set(item.date, { net: existingDay.net + net, hasReimbursement })

    if (net > 0) {
      totalExpense += net
      if (item.categoryId) {
        spendByCategory.set(item.categoryId, (spendByCategory.get(item.categoryId) ?? 0) + net)
      }
    } else if (net < 0) {
      totalIncome += Math.abs(net)
      if (item.categoryId) {
        incomeByCategory.set(item.categoryId, (incomeByCategory.get(item.categoryId) ?? 0) + Math.abs(net))
      }
    }
  }

  return { spendByCategory, incomeByCategory, spendByDay, totalExpense, totalIncome }
}
