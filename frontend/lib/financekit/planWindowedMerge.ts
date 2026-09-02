import type { AdaptedTransaction } from './adaptTransaction'

/**
 * Merges a windowed re-read of FinanceKit transactions into the cache.
 *
 * expo-finance-kit exposes only filtered queries — its TransactionQueryOptions has no `since` or
 * history-token field — so the sync re-reads a trailing window rather than applying a delta. That
 * turns out simpler than a delta: everything at or after `windowStart` is authoritative from the
 * read, so inserts, amount changes, pending→posted transitions, and disappearances are all handled
 * by one rule instead of three collections. Rows older than the window are kept as-is, which is
 * what stops a short window from erasing history.
 *
 * A null windowStart means "everything is in the window" — a full replacement, used for the first
 * sync and after a revoke/re-grant.
 *
 * Idempotent: syncing the same window twice yields the same array.
 */
export function planWindowedMerge(
  cached: AdaptedTransaction[],
  fetched: AdaptedTransaction[],
  windowStart: string | null,
): AdaptedTransaction[] {
  // Partitioned on transactionDate, the field the fetch predicate filters on — not on `date`,
  // which is the posted date. Splitting on a different field than the fetch leaves a gap: a charge
  // authorized before the window but posted inside it is in neither half and vanishes.
  const olderThanWindow =
    windowStart === null ? [] : cached.filter((txn) => txn.transactionDate < windowStart)

  return [...olderThanWindow, ...fetched].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  )
}
