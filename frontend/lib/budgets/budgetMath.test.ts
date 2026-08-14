import { describe, expect, it } from 'vitest'
import {
  budgetStatus,
  dailyAllowance,
  monthElapsedFraction,
  resolveBudgetsForMonth,
  suggestBudgetAmount,
} from './budgetMath'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Budget } from '@/types/domain'

function budget(overrides: Partial<Budget> & Pick<Budget, 'id' | 'categoryId' | 'amount' | 'effectiveMonth'>): Budget {
  return { period: 'monthly', alertThreshold: null, ...overrides } as Budget
}

describe('resolveBudgetsForMonth', () => {
  const history = [
    budget({ id: 'b1', categoryId: 'food', amount: '400.00', effectiveMonth: '2026-03-01' }),
    budget({ id: 'b2', categoryId: 'food', amount: '600.00', effectiveMonth: '2026-08-01' }),
    budget({ id: 'b3', categoryId: 'fun', amount: '150.00', effectiveMonth: '2026-05-01' }),
  ]

  it('a viewed month sees the amount that was in force then — history stays honest', () => {
    expect(resolveBudgetsForMonth(history, { year: 2026, month: 7 }).get('food')!.amount).toBe(400)
    expect(resolveBudgetsForMonth(history, { year: 2026, month: 8 }).get('food')!.amount).toBe(600)
  })

  it('months before a budget existed see nothing', () => {
    expect(resolveBudgetsForMonth(history, { year: 2026, month: 2 }).has('food')).toBe(false)
  })

  it('a tombstone removes the budget from that month forward, not backward', () => {
    const withStop = [...history, budget({ id: 'b4', categoryId: 'fun', amount: null, effectiveMonth: '2026-07-01' })]
    expect(resolveBudgetsForMonth(withStop, { year: 2026, month: 6 }).get('fun')!.amount).toBe(150)
    expect(resolveBudgetsForMonth(withStop, { year: 2026, month: 7 }).has('fun')).toBe(false)
  })

  it('carries the alert threshold of the resolved row', () => {
    const rows = [budget({ id: 'b5', categoryId: 'food', amount: '400.00', effectiveMonth: '2026-01-01', alertThreshold: 80 })]
    expect(resolveBudgetsForMonth(rows, { year: 2026, month: 6 }).get('food')!.alertThreshold).toBe(80)
  })
})

describe('budgetStatus', () => {
  it('over when spent exceeds the budget, regardless of date', () => {
    expect(budgetStatus(401, 400, 0.1)).toBe('over')
  })

  it('at-risk when spending runs ahead of the calendar', () => {
    expect(budgetStatus(320, 400, 0.25)).toBe('at-risk') // 80% spent, quarter through the month
  })

  it('on-track when pace matches the calendar, even at high percentages', () => {
    expect(budgetStatus(360, 400, 0.95)).toBe('on-track') // 90% spent, month nearly over
  })
})

describe('monthElapsedFraction', () => {
  it('is 1 for past months, 0 for future, fractional for the current', () => {
    const today = new Date(2026, 7, 15) // Aug 15
    expect(monthElapsedFraction({ year: 2026, month: 7 }, today)).toBe(1)
    expect(monthElapsedFraction({ year: 2026, month: 9 }, today)).toBe(0)
    expect(monthElapsedFraction({ year: 2026, month: 8 }, today)).toBeCloseTo(15 / 31)
  })
})

describe('dailyAllowance', () => {
  it('divides what is left across the remaining days, counting today', () => {
    const today = new Date(2026, 7, 30) // Aug 30 -> 2 days left
    expect(dailyAllowance(50, { year: 2026, month: 8 }, today)).toBe(25)
  })

  it('is null outside the current month and never negative', () => {
    const today = new Date(2026, 7, 15)
    expect(dailyAllowance(50, { year: 2026, month: 7 }, today)).toBeNull()
    expect(dailyAllowance(-80, { year: 2026, month: 8 }, today)).toBe(0)
  })
})

describe('suggestBudgetAmount', () => {
  function spend(id: string, date: string, amount: number, categoryId = 'food'): FeedItem {
    return {
      id, date, amount, categoryId,
      source: 'plaid', merchantName: 'x', subcategoryId: null, categorySource: 'plaid_pfc',
      confidenceLevel: null, pfcDetailed: null, accountId: 'a', pending: false, note: null,
      reimbursedAmount: null, netAmount: null, isReimbursementIncome: false, reimbursementCategoryId: null,
      transferId: null, transferKind: null, transferRole: null, transferSource: null,
      isBrokerageCashAccount: false, isSweptOutflow: false, links: [],
    } as FeedItem
  }
  const today = new Date(2026, 7, 15) // Aug 2026 -> looks at May, Jun, Jul

  it('suggests the all-time average of full months, rounded to a human number', () => {
    const feed = [
      spend('1', '2026-05-10', 380), spend('2', '2026-06-10', 442), spend('3', '2026-07-10', 401),
      spend('4', '2026-08-10', 999), // current month is partial — ignored
    ]
    expect(suggestBudgetAmount(feed, 'food', today)).toBe(410) // (380+442+401)/3 = 407.67 -> 410
  })

  it('starts the average at the first spend and counts skipped months as zeros', () => {
    // First spend Feb, nothing in Mar-Jun, spend again in Jul: 6 full months spanned.
    const feed = [spend('1', '2026-02-10', 600), spend('2', '2026-07-10', 600)]
    expect(suggestBudgetAmount(feed, 'food', today)).toBe(200) // 1200/6
  })

  it('does not dilute a recently started category across older feed history', () => {
    // Other categories go back to 2025; this one started in July at $50.
    const feed = [spend('1', '2025-01-10', 900, 'other'), spend('2', '2026-07-10', 50)]
    expect(suggestBudgetAmount(feed, 'food', today)).toBe(50) // 50/1, not 50/19
  })

  it('ignores pending rows and other categories, and returns null with no history', () => {
    const feed = [
      { ...spend('1', '2026-06-10', 300), pending: true },
      spend('2', '2026-06-11', 120, 'other'),
    ]
    expect(suggestBudgetAmount(feed, 'food', today)).toBeNull()
  })
})
