import { colors } from '@/constants/theme'
import { countsTowardTotals } from './totals'
import type { FeedItem } from './resolveFeed'

/**
 * What colour a transaction's amount is written in, wherever it appears — the feed row and the
 * detail sheet share this so the same transaction can never read as spending in one place and as
 * excluded in the other.
 *
 * Grey means "not in any total", keyed on the same predicate the aggregates use. The exception is
 * a reimbursement's income leg: it is excluded (its expense is already netted by it, so counting
 * it too would double-credit) but the money did arrive, so it takes the reimbursed colour rather
 * than reading as deleted — its pill and the net on its expense carry the rest.
 */
export function transactionAmountColor(item: FeedItem): string {
  if (item.isReimbursementIncome) return colors.reimbursed
  if (!countsTowardTotals(item)) return colors.textMuted
  return item.amount < 0 ? colors.income : colors.expense
}

/** '+' for money in, '-' for money out — the feed's convention is positive = spent. */
export function amountSign(item: FeedItem): string {
  return item.amount < 0 ? '+' : '-'
}
