import { describe, expect, it } from 'vitest'
import { findCrossedAlerts } from './alertCheck'
import type { ResolvedBudget } from './budgetMath'

function budget(overrides: Partial<ResolvedBudget> & Pick<ResolvedBudget, 'budgetId' | 'categoryId'>): ResolvedBudget {
  return { amount: 500, alertThreshold: 80, effectiveMonth: '2026-08-01', ...overrides }
}

const MONTH = '2026-08-01'
const neverFired = () => false

describe('findCrossedAlerts', () => {
  it('fires once spending reaches the threshold line, not before', () => {
    const resolved = new Map([['food', budget({ budgetId: 'b1', categoryId: 'food' })]]) // line at $400
    expect(findCrossedAlerts(resolved, new Map([['food', 399.99]]), MONTH, neverFired)).toHaveLength(0)
    const fired = findCrossedAlerts(resolved, new Map([['food', 400]]), MONTH, neverFired)
    expect(fired).toHaveLength(1)
    expect(fired[0]).toMatchObject({ budgetId: 'b1', thresholdDollars: 400, spent: 400 })
  })

  it('skips budgets with alerts off and keys already fired', () => {
    const resolved = new Map([
      ['food', budget({ budgetId: 'b1', categoryId: 'food' })],
      ['fun', budget({ budgetId: 'b2', categoryId: 'fun', alertThreshold: null })],
    ])
    const spend = new Map([
      ['food', 450],
      ['fun', 450],
    ])
    expect(findCrossedAlerts(resolved, spend, MONTH, neverFired)).toHaveLength(1)
    expect(findCrossedAlerts(resolved, spend, MONTH, () => true)).toHaveLength(0)
  })

  it('re-arms when the threshold changes — the key encodes the line', () => {
    const at80 = new Map([['food', budget({ budgetId: 'b1', categoryId: 'food', alertThreshold: 80 })]])
    const at90 = new Map([['food', budget({ budgetId: 'b1', categoryId: 'food', alertThreshold: 90 })]])
    const spend = new Map([['food', 460]])
    const firstKey = findCrossedAlerts(at80, spend, MONTH, neverFired)[0]!.key
    const after = findCrossedAlerts(at90, spend, MONTH, (k) => k === firstKey)
    expect(after).toHaveLength(1)
    expect(after[0]!.key).not.toBe(firstKey)
  })
})
