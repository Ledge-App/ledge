import { describe, expect, it } from 'vitest'
import { fromCents, toCents } from './money.js'

describe('money', () => {
  it('converts a decimal string to integer cents', () => {
    expect(toCents('127.40')).toBe(12740)
    expect(toCents('0.00')).toBe(0)
    expect(toCents('100')).toBe(10000)
  })

  it('converts integer cents back to a fixed 2-decimal string', () => {
    expect(fromCents(12740)).toBe('127.40')
    expect(fromCents(0)).toBe('0.00')
    expect(fromCents(4000)).toBe('40.00')
  })

  it('round-trips without drift', () => {
    expect(fromCents(toCents('19.99'))).toBe('19.99')
  })
})
