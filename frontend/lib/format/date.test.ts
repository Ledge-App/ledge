import { describe, expect, it } from 'vitest'
import { formatFullDate } from './date'

describe('formatFullDate', () => {
  it('writes a date key out with its weekday', () => {
    expect(formatFullDate('2026-07-20')).toBe('Mon, Jul 20, 2026')
  })

  it('does not shift the day for a timezone behind UTC', () => {
    // Read as local time, midnight UTC is the previous evening in the Americas, which would
    // render every transaction one day early.
    expect(formatFullDate('2026-01-01')).toBe('Thu, Jan 1, 2026')
  })

  it('is unaffected by a DST boundary', () => {
    expect(formatFullDate('2026-03-08')).toBe('Sun, Mar 8, 2026')
  })

  it('returns an unparseable key untouched rather than rendering Invalid Date', () => {
    expect(formatFullDate('not-a-date')).toBe('not-a-date')
  })
})
