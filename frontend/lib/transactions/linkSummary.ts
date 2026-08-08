import { formatAmount } from '@/lib/format/money'
import type { FeedItem } from './resolveFeed'

/**
 * The pill a reimbursement leg wears under its amount.
 *
 * Reimbursement legs are the one linked kind with no transfer badge to explain them —
 * applyTransfers stamps transferKind only on the other kinds — and they're also the one kind
 * whose row amount doesn't match what the totals count. The pill closes both gaps: on the
 * expense it names the gap between the charge and the net, and on the income it names the
 * expense that income paid back.
 *
 * Null for everything else, which the transfer badge already covers.
 */
export function linkPillLabel(item: FeedItem): string | null {
  // Just what came back. The net is a subtraction away from two numbers already on the row, and
  // spelling it out here made the pill long enough to crowd the merchant name.
  if (item.reimbursedAmount != null) return `Reimbursed: ${formatAmount(item.reimbursedAmount)}`
  if (item.isReimbursementIncome) {
    // Several links can't happen here — one income pays back one expense — so the first link is
    // the whole story. It still may not name anything, if the expense is outside the feed.
    const merchant = item.links[0]?.merchantName
    return merchant ? `Reimbursed: ${merchant}` : 'Reimbursed'
  }
  return null
}
