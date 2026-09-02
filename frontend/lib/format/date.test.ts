import { describe, expect, it } from 'vitest'
import { formatDayLabel, formatFullDate, formatRelativeIsoTime, formatRelativeTime } from './date'

describe('formatDayLabel', () => {
  // Mid-year on purpose: a `now` on Jan 1 would make the assertions depend on the runner's
  // timezone, since the current year is read from the local calendar.
  const NOW = Date.UTC(2026, 6, 15)

  it('omits the year for a date in the current year', () => {
    expect(formatDayLabel('2026-07-10', NOW)).toBe('7/10 Fri')
  })

  it('shows the year for a date in an earlier year', () => {
    // Apple Cash history reaches back years, and without the year this is indistinguishable from
    // the same calendar day in any other year.
    expect(formatDayLabel('2024-11-27', NOW)).toBe('11/27/2024 Wed')
  })

  it('shows the year for a date in a later year', () => {
    expect(formatDayLabel('2027-01-01', NOW)).toBe('1/1/2027 Fri')
  })

  it('does not shift the day for a timezone behind UTC', () => {
    expect(formatDayLabel('2026-01-01', NOW)).toBe('1/1 Thu')
  })

  it('returns an unparseable key untouched', () => {
    expect(formatDayLabel('not-a-date', NOW)).toBe('not-a-date')
  })
})

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


describe('formatRelativeTime', () => {
  const now = Date.parse('2026-08-25T12:00:00Z')

  it('collapses the last minute to "just now" rather than counting seconds', () => {
    expect(formatRelativeTime(now - 5_000, now)).toBe('just now')
    expect(formatRelativeTime(now - 59_000, now)).toBe('just now')
  })

  it('counts whole minutes within the hour', () => {
    expect(formatRelativeTime(now - 60_000, now)).toBe('1 min ago')
    expect(formatRelativeTime(now - 45 * 60_000, now)).toBe('45 min ago')
  })

  it('switches to hours past an hour', () => {
    expect(formatRelativeTime(now - 60 * 60_000, now)).toBe('1 hr ago')
    expect(formatRelativeTime(now - 5 * 60 * 60_000, now)).toBe('5 hr ago')
  })

  it('switches to days past a day, pluralizing', () => {
    expect(formatRelativeTime(now - 24 * 60 * 60_000, now)).toBe('1 day ago')
    expect(formatRelativeTime(now - 3 * 24 * 60 * 60_000, now)).toBe('3 days ago')
  })

  // Device clocks drift; a timestamp from the future must not render "-3 min ago".
  it('never reports a future timestamp as negative', () => {
    expect(formatRelativeTime(now + 5 * 60_000, now)).toBe('just now')
  })

  it('has nothing to report when the data never loaded', () => {
    expect(formatRelativeTime(null, now)).toBeNull()
    expect(formatRelativeTime(0, now)).toBeNull()
  })
})

describe('formatRelativeIsoTime', () => {
  const now = Date.parse('2026-08-25T12:00:00Z')

  it('reports how stale a date-only value is', () => {
    expect(formatRelativeIsoTime('2026-08-23', now)).toBe('2 days ago')
  })

  it('keeps minute precision when the institution reports a datetime', () => {
    expect(formatRelativeIsoTime('2026-08-25T11:30:00Z', now)).toBe('30 min ago')
  })

  it('has nothing to show when the institution never dated the price', () => {
    expect(formatRelativeIsoTime(null, now)).toBeNull()
  })

  it('returns null rather than "Invalid Date" on a value it cannot parse', () => {
    expect(formatRelativeIsoTime('not-a-date', now)).toBeNull()
  })
})
