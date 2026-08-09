import type { FeedItem } from '@/lib/transactions/resolveFeed'

/**
 * Net money the user has put into an account: what they contributed, less what they took back out.
 * Null when the account has no transfers at all, so a caller can omit the figure rather than
 * print a meaningless zero.
 *
 * The complement of market value. Market value answers "what is this worth now"; this answers "how
 * much of that is mine rather than growth". Only cash crossing the account boundary is counted,
 * which is exactly what the feed holds for investment accounts — trades never reach it, so a
 * rebalance cannot move this number.
 *
 * Filters to `source === 'investment'` rather than trusting the caller's slice. An investment
 * account's slice should contain nothing else (`/transactions/sync` returns nothing for these
 * accounts), but a plaid row appearing here would be a brokerage-cash movement, and counting it
 * would double-count the transfer that funded it.
 *
 * KNOWN LIMIT: this covers only what the feed holds, and the investments endpoint serves roughly
 * 24 months. On an account held for years it is a window total and understates — potentially by a
 * lot. Two consequences worth keeping in mind before building on it:
 *  - do not derive a gain from it. `marketValue - principal` is only true when the window reaches
 *    the account's opening; otherwise it reports pre-window contributions as profit;
 *  - do not label it as a lifetime figure anywhere.
 */
export function netPrincipal(items: FeedItem[]): number | null {
  let amount = 0
  let found = false

  for (const item of items) {
    if (item.source !== 'investment') continue
    found = true
    // Feed convention is positive-is-money-out, so a contribution is negative and a withdrawal
    // positive. Negating turns that into "money in, net".
    amount -= item.amount
  }

  return found ? amount : null
}
