import type { FeedItem } from './resolveFeed'

export interface DayGroup {
  /** YYYY-MM-DD, the grouping key. */
  date: string
  items: FeedItem[]
}

/**
 * Buckets a feed into calendar days, newest first, preserving the order items arrived in within
 * each day. Shared by every surface that lists transactions under day headers, which previously
 * each carried their own copy of this loop.
 *
 * Sorted on the raw YYYY-MM-DD string rather than parsed dates: the keys are fixed-width and
 * zero-padded, so lexical order is chronological order, and no timezone can shift a day.
 */
export function groupByDay(items: FeedItem[]): DayGroup[] {
  const byDate = new Map<string, FeedItem[]>()
  for (const item of items) {
    const bucket = byDate.get(item.date) ?? []
    bucket.push(item)
    byDate.set(item.date, bucket)
  }
  return Array.from(byDate.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayItems]) => ({ date, items: dayItems }))
}
