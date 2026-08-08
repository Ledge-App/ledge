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
 * An account where idle cash is swept into holdings rather than spent — Plaid's 'cash management'
 * depository subtype ("a cash account at a brokerage", e.g. a Fidelity CMA), or any investment
 * account.
 *
 * This is the boundary where transfer *pairing* structurally cannot work, which is the only
 * reason a PFC-based exclusion is justified at all. A sweep's counterpart is either an investment
 * transaction (a different Plaid product, never in /transactions/sync) or a second leg on the very
 * same account, which autoMatch's pairAllowed rejects outright. Everywhere else, pairing is the
 * right mechanism and already works: a linked counterpart auto-applies as a transfer, and an
 * unlinked one is left counted deliberately — see the design doc's preference for leaving money
 * counted over wrongly hiding it.
 *
 * Plaid's own schema draws the boundary the same way: "Investments does not support depository
 * types other than `cash management`."
 */
export function isBrokerageCashAccount(account: { type: string; subtype?: string | null }): boolean {
  return account.subtype === 'cash management' || isInvestmentAccount(account)
}
