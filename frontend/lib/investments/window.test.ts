import { describe, expect, it } from 'vitest'
import {
  BACKFILL_DAYS,
  MAX_FAILED_ATTEMPTS_BEFORE_NARROWING,
  OVERLAP_DAYS,
  fetchWindow,
  isWindowSufficient,
  mergeInvestmentTransactions,
  resolveItemOutcome,
  selectFetchWindow,
} from './window'

function daysBetweenIso(a: string, b: string): number {
  const ms = Math.abs(new Date(a + 'T00:00:00Z').getTime() - new Date(b + 'T00:00:00Z').getTime())
  return Math.round(ms / 86_400_000)
}

const row = (id: string, date: string, amount = -100) => ({
  investmentTransactionId: id,
  accountId: 'acc-1',
  date,
  name: 'ACH Deposit',
  amount,
  quantity: 0,
  price: 0,
  fees: null,
  type: 'cash',
  subtype: 'contribution',
  ticker: null,
  securityName: null,
})

describe('fetchWindow', () => {
  it('backfills 24 months when the item has never been fetched', () => {
    expect(fetchWindow(new Date('2026-08-08T12:00:00Z'), undefined)).toEqual({
      startDate: '2024-08-08',
      endDate: '2026-08-08',
    })
    expect(BACKFILL_DAYS).toBe(730)
  })

  it('re-fetches only a 30-day overlap once a backfill exists', () => {
    expect(fetchWindow(new Date('2026-08-08T12:00:00Z'), '2026-08-01')).toEqual({
      startDate: '2026-07-09',
      endDate: '2026-08-08',
    })
    expect(OVERLAP_DAYS).toBe(30)
  })

  it('widens back to a full backfill when the last fetch is older than the overlap window', () => {
    // App unused for two months: a 30-day window would leave a permanent hole.
    expect(fetchWindow(new Date('2026-08-08T12:00:00Z'), '2026-05-01')).toEqual({
      startDate: '2024-08-08',
      endDate: '2026-08-08',
    })
  })

  it('produces a well-defined start date when today is a leap day', () => {
    const { startDate, endDate } = fetchWindow(new Date('2028-02-29T12:00:00Z'), undefined)
    // setUTCDate never normalizes an invalid calendar date the way setUTCMonth does — there is
    // no such thing as an "invalid day" to roll forward from. For this specific today, 730 days
    // back from Feb 29, 2028 lands on Mar 1, 2026 — the same string setUTCMonth's buggy forward
    // normalization used to produce, but arrived at by exact day-count arithmetic rather than a
    // silent overflow. That coincidence only holds for this exact date; the invariant that
    // actually guards against drift is the fixed span below, which holds for every `today`.
    expect(startDate).toBe('2026-03-01')
    expect(daysBetweenIso(startDate, endDate)).toBe(BACKFILL_DAYS)
  })

  it('pins the full-backfill span to BACKFILL_DAYS regardless of the calendar', () => {
    const { startDate, endDate } = fetchWindow(new Date('2026-08-08T12:00:00Z'), undefined)
    expect(daysBetweenIso(startDate, endDate)).toBe(BACKFILL_DAYS)
  })
})

describe('selectFetchWindow', () => {
  const today = new Date('2026-08-08T12:00:00Z')

  it('widens for an item that has never been attempted', () => {
    const result = selectFetchWindow([{ backfilledThrough: undefined, failedAttempts: 0 }], today)
    expect(result).toEqual({ startDate: '2024-08-08', endDate: '2026-08-08' })
  })

  it('still widens for a never-backfilled item with too few consecutive failures to narrow', () => {
    const result = selectFetchWindow(
      [{ backfilledThrough: undefined, failedAttempts: MAX_FAILED_ATTEMPTS_BEFORE_NARROWING - 1 }],
      today,
    )
    expect(result).toEqual({ startDate: '2024-08-08', endDate: '2026-08-08' })
  })

  it('stops widening once a never-backfilled item has failed enough times in a row', () => {
    const result = selectFetchWindow(
      [{ backfilledThrough: undefined, failedAttempts: MAX_FAILED_ATTEMPTS_BEFORE_NARROWING }],
      today,
    )
    expect(result).toEqual({ startDate: '2026-07-09', endDate: '2026-08-08' })
  })

  it('uses the 30-day overlap window for a recently successful item, regardless of failedAttempts', () => {
    const result = selectFetchWindow([{ backfilledThrough: '2026-08-01', failedAttempts: 0 }], today)
    expect(result).toEqual({ startDate: '2026-07-09', endDate: '2026-08-08' })
  })

  it('picks the widest window across a mix of items: a never-attempted item forces the full backfill', () => {
    const result = selectFetchWindow(
      [
        { backfilledThrough: '2026-08-01', failedAttempts: 0 },
        { backfilledThrough: undefined, failedAttempts: 0 },
      ],
      today,
    )
    expect(result).toEqual({ startDate: '2024-08-08', endDate: '2026-08-08' })
  })

  it('a permanently-failing item does not drag a successful item back up to the full backfill', () => {
    const result = selectFetchWindow(
      [
        { backfilledThrough: '2026-08-01', failedAttempts: 0 },
        { backfilledThrough: undefined, failedAttempts: MAX_FAILED_ATTEMPTS_BEFORE_NARROWING + 5 },
      ],
      today,
    )
    expect(result).toEqual({ startDate: '2026-07-09', endDate: '2026-08-08' })
  })

  it('returns null when there are no items', () => {
    expect(selectFetchWindow([], today)).toBeNull()
  })
})

describe('isWindowSufficient', () => {
  const today = new Date('2026-08-08T12:00:00Z')

  it('reports unsatisfied for a never-backfilled item when the sent window was narrowed', () => {
    // A never-backfilled item at the failure cap gets narrowed by selectFetchWindow to the
    // 30-day overlap. That narrowed window does not cover this item's true 730-day need.
    const item = { backfilledThrough: undefined, failedAttempts: MAX_FAILED_ATTEMPTS_BEFORE_NARROWING }
    const sentWindow = selectFetchWindow([item], today)!
    expect(sentWindow).toEqual({ startDate: '2026-07-09', endDate: '2026-08-08' })
    expect(isWindowSufficient(item.backfilledThrough, sentWindow)).toBe(false)
  })

  it('reports satisfied for a never-backfilled item when the sent window was the full backfill', () => {
    // Below the failure cap (or with another item forcing the wide window), the sent window
    // is the same 730-day span this item actually needs.
    const item = { backfilledThrough: undefined, failedAttempts: 0 }
    const sentWindow = selectFetchWindow([item], today)!
    expect(sentWindow).toEqual({ startDate: '2024-08-08', endDate: '2026-08-08' })
    expect(isWindowSufficient(item.backfilledThrough, sentWindow)).toBe(true)
  })

  it('reports satisfied for an item already on the overlap branch', () => {
    const item = { backfilledThrough: '2026-08-01', failedAttempts: 0 }
    const sentWindow = selectFetchWindow([item], today)!
    expect(sentWindow).toEqual({ startDate: '2026-07-09', endDate: '2026-08-08' })
    expect(isWindowSufficient(item.backfilledThrough, sentWindow)).toBe(true)
  })
})

// resolveItemOutcome is what the hook's onSuccess actually calls for every item — it is the
// single place all three of an item's post-fetch writes (cache, marker, failure count) are
// decided, and the hook performs exactly what it returns with no decision logic of its own.
// These tests bind the REAL decision function the hook uses, not a re-implementation of it in
// the test — inverting or deleting resolveItemOutcome's marker gate must fail one of these
// (see the last test's comment for how that was verified).
describe('resolveItemOutcome', () => {
  const today = new Date('2026-08-08T12:00:00Z')

  it('a failed item never caches, never advances, and its failure count increments', () => {
    const fetchRange = { startDate: '2024-08-08', endDate: '2026-08-08' }
    const outcome = resolveItemOutcome({ failed: true, backfilledThrough: undefined, failedAttempts: 1, fetchRange })
    expect(outcome).toEqual({ cacheRows: false, advanceMarker: false, nextFailedAttempts: 2 })
  })

  it('a narrowed success caches rows, does not advance the marker, but resets the failure count', () => {
    const failingItem = { backfilledThrough: undefined, failedAttempts: MAX_FAILED_ATTEMPTS_BEFORE_NARROWING }
    const narrowedRange = selectFetchWindow([failingItem], today)!
    expect(narrowedRange).toEqual({ startDate: '2026-07-09', endDate: '2026-08-08' })

    const outcome = resolveItemOutcome({
      failed: false,
      backfilledThrough: failingItem.backfilledThrough,
      failedAttempts: failingItem.failedAttempts,
      fetchRange: narrowedRange,
    })
    expect(outcome).toEqual({ cacheRows: true, advanceMarker: false, nextFailedAttempts: 0 })
  })

  it('a sufficient success caches rows and advances the marker', () => {
    const item = { backfilledThrough: undefined, failedAttempts: 0 }
    const fullRange = selectFetchWindow([item], today)!
    expect(fullRange).toEqual({ startDate: '2024-08-08', endDate: '2026-08-08' })

    const outcome = resolveItemOutcome({
      failed: false,
      backfilledThrough: item.backfilledThrough,
      failedAttempts: item.failedAttempts,
      fetchRange: fullRange,
    })
    expect(outcome).toEqual({ cacheRows: true, advanceMarker: true, nextFailedAttempts: 0 })
  })

  it('a routine overlap success caches rows and advances the marker', () => {
    const item = { backfilledThrough: '2026-08-01', failedAttempts: 0 }
    const overlapRange = selectFetchWindow([item], today)!
    expect(overlapRange).toEqual({ startDate: '2026-07-09', endDate: '2026-08-08' })

    const outcome = resolveItemOutcome({
      failed: false,
      backfilledThrough: item.backfilledThrough,
      failedAttempts: item.failedAttempts,
      fetchRange: overlapRange,
    })
    expect(outcome).toEqual({ cacheRows: true, advanceMarker: true, nextFailedAttempts: 0 })
  })

  // Regression guard for the truncation bug, pinned against the real production decision
  // function (not a re-implementation of it): a never-backfilled item fails
  // MAX_FAILED_ATTEMPTS_BEFORE_NARROWING times in a row — plausible for a run of transient
  // failures (rate limit, brief outage) across that many cold starts, since the counter
  // persists in MMKV — gets narrowed on the next attempt, and that narrowed attempt succeeds.
  // Each step feeds the PREVIOUS step's own resolveItemOutcome output back in as the next
  // step's input (no hardcoded intermediate state), mirroring exactly how the hook threads
  // MMKV state across mounts. The final assertion is what would break if the marker gate were
  // removed or inverted: the item's window after the narrowed success must still be the full
  // 730-day backfill, not the 30-day overlap.
  it('fail x N -> narrow -> succeed -> still widens fully on the next attempt', () => {
    let backfilledThrough: string | undefined = undefined
    let failedAttempts = 0

    for (let i = 0; i < MAX_FAILED_ATTEMPTS_BEFORE_NARROWING; i++) {
      const fetchRange = selectFetchWindow([{ backfilledThrough, failedAttempts }], today)!
      const outcome = resolveItemOutcome({ failed: true, backfilledThrough, failedAttempts, fetchRange })
      expect(outcome.advanceMarker).toBe(false)
      failedAttempts = outcome.nextFailedAttempts
      // backfilledThrough only ever changes via advanceMarker, which never fires on failure.
    }
    expect(failedAttempts).toBe(MAX_FAILED_ATTEMPTS_BEFORE_NARROWING)

    const narrowedRange = selectFetchWindow([{ backfilledThrough, failedAttempts }], today)!
    expect(narrowedRange).toEqual({ startDate: '2026-07-09', endDate: '2026-08-08' })

    const successOutcome = resolveItemOutcome({ failed: false, backfilledThrough, failedAttempts, fetchRange: narrowedRange })
    expect(successOutcome).toEqual({ cacheRows: true, advanceMarker: false, nextFailedAttempts: 0 })
    if (successOutcome.advanceMarker) backfilledThrough = narrowedRange.endDate
    failedAttempts = successOutcome.nextFailedAttempts

    const nextRange = selectFetchWindow([{ backfilledThrough, failedAttempts }], today)!
    expect(nextRange).toEqual({ startDate: '2024-08-08', endDate: '2026-08-08' })
  })
})

describe('mergeInvestmentTransactions', () => {
  it('is idempotent — re-merging the same window does not duplicate', () => {
    const cached = [row('a', '2026-07-01'), row('b', '2026-07-15')]
    const merged = mergeInvestmentTransactions(cached, [row('a', '2026-07-01'), row('b', '2026-07-15')])
    expect(merged.map((t) => t.investmentTransactionId)).toEqual(['b', 'a'])
  })

  it('lets an incoming row correct a cached one with the same id', () => {
    const merged = mergeInvestmentTransactions([row('a', '2026-07-01', -100)], [row('a', '2026-07-01', -250)])
    expect(merged).toHaveLength(1)
    expect(merged[0].amount).toBe(-250)
  })

  it('keeps cached rows that fall outside the incoming window', () => {
    const merged = mergeInvestmentTransactions([row('old', '2025-01-01')], [row('new', '2026-08-01')])
    expect(merged.map((t) => t.investmentTransactionId)).toEqual(['new', 'old'])
  })

  it('sorts newest first, matching mergeFeed', () => {
    const merged = mergeInvestmentTransactions([], [row('a', '2026-01-01'), row('c', '2026-08-01'), row('b', '2026-04-01')])
    expect(merged.map((t) => t.investmentTransactionId)).toEqual(['c', 'b', 'a'])
  })
})
