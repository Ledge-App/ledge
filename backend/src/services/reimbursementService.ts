import { fromCents, toCents } from '../lib/money.js'

export const reimbursementService = {
  calculateNetExpense(originalAmount: string, reimbursements: Array<{ amount: string }>): string {
    const originalCents = toCents(originalAmount)
    const reimbursedCents = reimbursements.reduce((sum, r) => sum + toCents(r.amount), 0)
    return fromCents(Math.max(0, originalCents - reimbursedCents))
  },
}
