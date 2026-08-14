import { countsTowardTotals } from '@/lib/transactions/totals'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Budget } from '@/types/domain'
import type { YearMonth } from '@/lib/transactions/filterByMonth'

/**
 * Pure budget math. Budgets are monthly and effective-dated on the server: one row per
 * (category, month a change took effect), amount null marking "stopped budgeting here".
 * Everything below resolves that history for a viewed month, paces the current month, and
 * suggests amounts from spending history — no I/O, fully unit-testable.
 */

export interface ResolvedBudget {
  /** The row in force for the viewed month (its id is what edits replace). */
  budgetId: string
  categoryId: string
  amount: number
  alertThreshold: number | null
  /** Month the amount took effect — "since March" context for the edit sheet. */
  effectiveMonth: string
}

/** First-of-month key (YYYY-MM-01) — the shape budgets.set expects for effectiveMonth. */
export function monthKey({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/**
 * The budget in force per category for a viewed month: the latest row whose effective month
 * is on or before it. Categories whose resolved row is a tombstone (null amount) are simply
 * absent — from the viewed month's perspective, no budget exists.
 */
export function resolveBudgetsForMonth(budgets: Budget[], month: YearMonth): Map<string, ResolvedBudget> {
  const viewedKey = monthKey(month)
  const byCategory = new Map<string, Budget>()
  for (const row of budgets) {
    if (row.effectiveMonth > viewedKey) continue
    const current = byCategory.get(row.categoryId)
    if (!current || row.effectiveMonth > current.effectiveMonth) byCategory.set(row.categoryId, row)
  }

  const resolved = new Map<string, ResolvedBudget>()
  for (const [categoryId, row] of byCategory) {
    if (row.amount === null) continue // tombstone: budgeting stopped before or in this month
    resolved.set(categoryId, {
      budgetId: row.id,
      categoryId,
      amount: Number(row.amount),
      alertThreshold: row.alertThreshold,
      effectiveMonth: row.effectiveMonth,
    })
  }
  return resolved
}

export type BudgetStatus = 'over' | 'at-risk' | 'on-track'

/** Fraction of the viewed month that has elapsed: 0..1, and 1 for months fully in the past. */
export function monthElapsedFraction(month: YearMonth, today: Date = new Date()): number {
  const daysInMonth = new Date(month.year, month.month, 0).getDate()
  const startOfNext = new Date(month.year, month.month, 1)
  const startOfMonth = new Date(month.year, month.month - 1, 1)
  if (today >= startOfNext) return 1
  if (today < startOfMonth) return 0
  return (today.getDate()) / daysInMonth
}

/**
 * Pace-aware status. "80% spent" is fine on day 28 and a fire on day 8, so the line isn't a
 * fixed percentage — it's the calendar. At-risk = spending ahead of elapsed time with a 10%
 * grace so a single early purchase doesn't flag a fresh month.
 */
export function budgetStatus(spent: number, amount: number, elapsedFraction: number): BudgetStatus {
  if (amount <= 0) return 'on-track'
  if (spent > amount) return 'over'
  const pace = spent / amount
  if (pace > Math.min(elapsedFraction + 0.1, 1)) return 'at-risk'
  return 'on-track'
}

/** What can still be spent per remaining day of the month; null once the month is over. */
export function dailyAllowance(remaining: number, month: YearMonth, today: Date = new Date()): number | null {
  const startOfNext = new Date(month.year, month.month, 1)
  const startOfMonth = new Date(month.year, month.month - 1, 1)
  if (today >= startOfNext || today < startOfMonth) return null
  const daysInMonth = new Date(month.year, month.month, 0).getDate()
  const daysLeft = daysInMonth - today.getDate() + 1 // today still counts
  return Math.max(0, remaining) / daysLeft
}

/**
 * A starting amount for a category the user hasn't budgeted: the average over every FULL month
 * since the category's first spend (the current month is partial and would drag the number
 * down). Zero-spend months inside that span count — the question is "what does a typical month
 * cost", not "what does a spending month cost" — but the span starts at the category's own
 * first spend, so a subscription started two months ago isn't diluted across two years of
 * feed history it wasn't part of. Null when there's no history — an empty suggestion beats a
 * made-up one.
 */
export function suggestBudgetAmount(
  feed: FeedItem[],
  categoryId: string,
  today: Date = new Date(),
): number | null {
  const currentKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const spendByMonth = new Map<string, number>()
  for (const item of feed) {
    if (item.categoryId !== categoryId || !countsTowardTotals(item)) continue
    const net = item.netAmount ?? item.amount
    if (net <= 0) continue // budgets track spending, not income
    const key = item.date.slice(0, 7)
    if (key >= currentKey) continue // partial current month (and any future-dated rows)
    spendByMonth.set(key, (spendByMonth.get(key) ?? 0) + net)
  }
  if (spendByMonth.size === 0) return null

  // Full months from the first spend through last month, inclusive — the divisor that makes
  // skipped months count as zeros.
  const firstKey = [...spendByMonth.keys()].sort()[0]
  const [firstYear, firstMonth] = firstKey.split('-').map(Number)
  const monthsSpanned = (today.getFullYear() - firstYear) * 12 + (today.getMonth() + 1 - firstMonth)

  const total = [...spendByMonth.values()].reduce((sum, v) => sum + v, 0)
  const average = total / Math.max(1, monthsSpanned)
  // A budget of $83.47 reads as noise — round to a number a person would have picked.
  return Math.max(5, Math.round(average / 5) * 5)
}
