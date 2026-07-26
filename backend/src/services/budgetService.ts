import { toCents } from '../lib/money.js'

export type BudgetStatus = 'on_track' | 'approaching' | 'over'

export const budgetService = {
  calculateProgress(
    budget: { amount: string },
    spentAmount: string,
  ): { spentCents: number; budgetCents: number; percent: number; status: BudgetStatus } {
    const budgetCents = toCents(budget.amount)
    const spentCents = toCents(spentAmount)
    const percent = budgetCents === 0 ? Infinity : (spentCents / budgetCents) * 100
    const status: BudgetStatus = percent > 90 ? 'over' : percent >= 70 ? 'approaching' : 'on_track'
    return { spentCents, budgetCents, percent, status }
  },
}
