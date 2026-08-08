import type { FeedItem } from './resolveFeed'

/**
 * Either leg of a transfer — the expense side or the linked income side. Answers "is there a
 * Transfer record here?", which is what the edit sheets need in order to offer unmark/undo.
 * For "should this count as spending", use isInternalMovement instead.
 */
export function isTransfer(item: FeedItem): boolean {
  return item.transferKind !== null
}

/**
 * PFC codes that describe money moving inside the user's own holdings, excluded from totals
 * even with no Transfer record to pair them against.
 *
 * A cash management account sweeps deposits into a fund, and Plaid reports that sweep as an
 * outflow on the cash side. Its counterpart is an investment transaction, served by
 * /investments/transactions/get rather than /transactions/sync (which is the only endpoint this
 * app reads), so it never enters the feed — and detectTransfers only emits paired drafts. No
 * transfer record can ever exist for a sweep, so PFC is the only signal available.
 *
 * All four codes are byte-identical across PFCv1 and PFCv2 (verified against Plaid's published
 * taxonomy), which matters because this app never sets options.personal_finance_category_version
 * on /transactions/sync — under BYOK, each user's own Plaid account decides which version they
 * get, so anything keyed on a PFC code has to hold in both.
 *
 * Kept deliberately narrow. Each of these is money the user still holds, with no purchase
 * hiding behind it. Excluded from the set, with Plaid's own descriptions as the reason:
 *  - LOAN_PAYMENTS_CREDIT_CARD_PAYMENT — when the card IS linked, autoMatch pairs it and the
 *    transfer record covers it. When it isn't, the payment is the only visible proxy for the
 *    purchases made on that card, so dropping it would make spend totals under-count.
 *  - TRANSFER_IN_DEPOSIT — "Cash, checks, and ATM deposits into a bank account": money arriving
 *    from outside, not shifted between the user's own accounts.
 *  - TRANSFER_OUT_WITHDRAWAL — "Withdrawals from a bank account"; the cash gets spent later.
 *  - *_ACCOUNT_TRANSFER — "General inbound/outbound transfers". Plaid's taxonomy has no
 *    peer-to-peer code at all, so Venmo/Zelle to a person lands here next to genuine internal
 *    moves, as does ACH rent. Excluding it wholesale would hide real spending; pairing handles
 *    the account-to-account case, and that path sets transferKind.
 */
const INTERNAL_MOVEMENT_PFC = new Set([
  'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS',
  'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS',
  'TRANSFER_OUT_SAVINGS',
  'TRANSFER_IN_SAVINGS',
])

/**
 * Money that moved between the user's own accounts or holdings rather than being spent or
 * earned — whether that was established by pairing two legs into a Transfer record, or by
 * Plaid's own PFC on a movement whose counterpart the feed can't see.
 */
export function isInternalMovement(item: FeedItem): boolean {
  if (isTransfer(item)) return true
  return item.pfcDetailed !== null && INTERNAL_MOVEMENT_PFC.has(item.pfcDetailed)
}

// Single predicate for "does this item belong in spend/income aggregates", so the donut, top
// merchants, the daily chart and the per-day IN/OUT rows can never disagree about what counts.
//
// Excluded:
//  - a reimbursement's income leg, already netted out of its expense — counting it double-credits;
//  - internal movement, which is money shifted between the user's own accounts or holdings, not
//    spending or income. Unpaired transfers are excluded too: the money still didn't leave the user.
export function countsTowardTotals(item: FeedItem): boolean {
  return !item.isReimbursementIncome && !isInternalMovement(item)
}
