import type { ResolvedBudget } from './budgetMath'

export interface BudgetAlert {
  budgetId: string
  categoryId: string
  thresholdPercent: number
  thresholdDollars: number
  spent: number
  amount: number
  /** Dedup key: one firing per budget row, month, and threshold setting. */
  key: string
}

/**
 * Which budget alerts should fire right now. Pure: the caller supplies the month's spend and a
 * lookup of already-fired keys (persisted on device — the server never sees transactions, so
 * alerts are computed here). The key includes the threshold, so changing the line re-arms the
 * alert; it includes the month, so every month starts fresh.
 */
export function findCrossedAlerts(
  resolved: Map<string, ResolvedBudget>,
  spendByCategory: Map<string, number>,
  monthKey: string,
  alreadyFired: (key: string) => boolean,
): BudgetAlert[] {
  const alerts: BudgetAlert[] = []
  for (const budget of resolved.values()) {
    if (budget.alertThreshold == null) continue
    const spent = spendByCategory.get(budget.categoryId) ?? 0
    const thresholdDollars = (budget.alertThreshold / 100) * budget.amount
    if (spent < thresholdDollars) continue
    const key = `${budget.budgetId}:${monthKey}:${budget.alertThreshold}`
    if (alreadyFired(key)) continue
    alerts.push({
      budgetId: budget.budgetId,
      categoryId: budget.categoryId,
      thresholdPercent: budget.alertThreshold,
      thresholdDollars,
      spent,
      amount: budget.amount,
      key,
    })
  }
  return alerts
}
