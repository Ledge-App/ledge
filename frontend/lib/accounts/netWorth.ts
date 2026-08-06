import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Account } from '@/types/domain'

/** Shared by every net worth figure in the app, so the Accounts screen and the trend sheet can never drift. */

export function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100
  // Negating a zero flow yields -0, which would render as "-$0.00".
  return rounded === 0 ? 0 : rounded
}

// Plaid's AccountType enum: 'investment' | 'credit' | 'depository' | 'loan' | 'brokerage' | 'other'.
// Credit cards AND loans (mortgage, student, auto) are liabilities — they must be subtracted
// from net worth, never added to assets.
export function isLiabilityAccount(account: { type: string }): boolean {
  return account.type === 'credit' || account.type === 'loan'
}

export function isInvestmentAccount(account: { type: string }): boolean {
  return account.type === 'investment' || account.type === 'brokerage'
}

/**
 * Cash held outside any linked account, derived from manual transactions: a manual income
 * adds to the pot, a manual expense draws it down.
 *
 * Plaid has no balance for a wallet, so the pot starts at zero before the first manual entry
 * — log a cash income and it becomes a real, spendable balance from there. That starting
 * point is what lets the trend history reconstruct cash at any past date rather than only
 * relative to today (see netWorthHistory.ts).
 *
 * A negative result is meaningful, not a bug: it means more cash has been spent than was
 * ever logged as received, i.e. the wallet started with money the app was never told about.
 *
 * Gross `amount`, not `netAmount` — a reimbursement's income leg is its own feed item, so
 * netting here would count the same dollars twice.
 */
export function computeCashOnHand(feed: FeedItem[]): number {
  let cash = 0
  for (const item of feed) {
    if (item.source !== 'manual') continue
    cash -= item.amount
  }
  return round2(cash)
}

export interface NetWorthTotals {
  /** Linked asset balances plus cash on hand. */
  totalAssets: number
  totalLiabilities: number
  /** The cash portion of totalAssets, broken out so the card can show where it came from. */
  cashOnHand: number
  netWorth: number
}

export function computeNetWorthTotals(accounts: Account[], feed: FeedItem[]): NetWorthTotals {
  let linkedAssets = 0
  let totalLiabilities = 0
  for (const account of accounts) {
    const balance = account.balances?.current ?? 0
    if (isLiabilityAccount(account)) totalLiabilities += balance
    else linkedAssets += balance
  }

  const cashOnHand = computeCashOnHand(feed)
  const totalAssets = round2(linkedAssets + cashOnHand)
  const liabilities = round2(totalLiabilities)

  return {
    totalAssets,
    totalLiabilities: liabilities,
    cashOnHand,
    netWorth: round2(totalAssets - liabilities),
  }
}
