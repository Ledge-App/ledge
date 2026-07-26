import { describe, expect, it } from 'vitest'
import { budgetService } from './budgetService.js'

describe('budgetService.calculateProgress', () => {
  it('reports on_track under 70% spent', () => {
    const result = budgetService.calculateProgress({ amount: '200.00' }, '127.40')
    expect(result.status).toBe('on_track')
    expect(result.percent).toBeCloseTo(63.7, 1)
  })

  it('reports approaching between 70% and 90% spent', () => {
    const result = budgetService.calculateProgress({ amount: '175.00' }, '152.00')
    expect(result.status).toBe('approaching')
  })

  it('reports over above 90% spent', () => {
    const result = budgetService.calculateProgress({ amount: '200.00' }, '320.00')
    expect(result.status).toBe('over')
    expect(result.percent).toBeCloseTo(160, 0)
  })

  it('handles a zero budget without dividing by zero', () => {
    const result = budgetService.calculateProgress({ amount: '0.00' }, '10.00')
    expect(result.percent).toBe(Infinity)
    expect(result.status).toBe('over')
  })
})
