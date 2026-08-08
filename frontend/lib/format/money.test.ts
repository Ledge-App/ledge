import { describe, expect, it } from 'vitest'
import { formatAmount, formatCompactAmount } from './money'

describe('formatCompactAmount', () => {
  it('keeps small amounts in full precision', () => {
    expect(formatCompactAmount(9999.99)).toBe(formatAmount(9999.99))
    expect(formatCompactAmount(42.15)).toBe('$42.15')
  })

  it('abbreviates thousands to ~4 significant characters', () => {
    expect(formatCompactAmount(39358.13)).toBe('$39.36k')
    expect(formatCompactAmount(151100)).toBe('$151.1k')
    expect(formatCompactAmount(10000)).toBe('$10k')
  })

  it('abbreviates millions and trims trailing zeros', () => {
    expect(formatCompactAmount(1_000_000)).toBe('$1M')
    expect(formatCompactAmount(2_500_000)).toBe('$2.5M')
    expect(formatCompactAmount(151_100_000)).toBe('$151.1M')
  })

  it('keeps up to four decimals for sub-dollar quotes', () => {
    expect(formatCompactAmount(0.011)).toBe('$0.011')
    expect(formatCompactAmount(0.0029)).toBe('$0.0029')
    expect(formatCompactAmount(0.5)).toBe('$0.50')
    expect(formatCompactAmount(0)).toBe('$0.00')
  })

  it('keeps the sign outside the symbol', () => {
    expect(formatCompactAmount(-39358.13)).toBe('-$39.36k')
  })
})
