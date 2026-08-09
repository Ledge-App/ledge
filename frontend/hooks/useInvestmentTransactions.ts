import { useMemo, useState } from 'react'
import { api } from '@/lib/api/client'
import {
  getCachedInvestmentTransactions,
  getInvestmentBackfilledThrough,
  getInvestmentFailedAttempts,
  setCachedInvestmentTransactions,
  setInvestmentBackfilledThrough,
  setInvestmentFailedAttempts,
} from '@/lib/storage/mmkv'
import { mergeInvestmentTransactions, resolveItemOutcome, selectFetchWindow } from '@/lib/investments/window'
import type { InvestmentTransaction, InvestmentTransactionItemError } from '@/types/domain'

/**
 * Investment transactions for every linked item, read through MMKV.
 *
 * /investments/transactions/get has no cursor, so this is a date-window fetch rather than a
 * delta: the widest window any item needs is requested once, and each item's rows are merged
 * into its own cache entry by id. The merge is idempotent, so a re-fetch of an overlapping
 * window costs bytes and nothing else.
 */
export function useInvestmentTransactions(itemIds: string[]): {
  transactions: InvestmentTransaction[]
  itemErrors: InvestmentTransactionItemError[]
} {
  // Bumped after the MMKV writes land, so the cached-rows memo below re-reads the cache. MMKV
  // writes are a side effect outside React state — same pattern as syncCompletedAt in
  // useTransactionFeed.
  const [fetchCompletedAt, setFetchCompletedAt] = useState(0)

  // One range covers every item: the widest any item needs (selectFetchWindow also narrows an
  // item that has never backfilled and keeps failing, so a permanently-unsupported item can't
  // drag every other item's request back up to 24 months forever — see that function's
  // comment). An item that only needed the 30-day overlap simply re-receives rows it already
  // has, which the merge dedupes.
  //
  // Deliberately NOT keyed on fetchCompletedAt. onSuccess advances backfilledThrough and bumps
  // fetchCompletedAt; if this memo also depended on fetchCompletedAt, that bump would recompute
  // the range on the very fetch that just landed — on a cold start that means a full 24-month
  // range fires, backfilledThrough gets set to today, and the recomputed range immediately
  // narrows to 30 days, which is a different query key and fires a second, wasted fetch.
  // Computing the range once per mount (or when the set of linked items changes) avoids that:
  // within a session the range is fixed, and the next app open re-derives it fresh from the
  // backfilledThrough (and failed-attempt) values this session's fetch just persisted.
  //
  // `today` is captured once here and never refreshed for the life of the mount, so an app left
  // open across midnight keeps requesting yesterday's date as `endDate`. That's a stale-by-one-
  // day request, not a correctness bug: the 30-day overlap on the next mount re-covers it, the
  // same way any dropped day would be.
  const fetchRange = useMemo(() => {
    const today = new Date()
    const items = itemIds.map((itemId) => ({
      backfilledThrough: getInvestmentBackfilledThrough(itemId),
      failedAttempts: getInvestmentFailedAttempts(itemId),
    }))
    return selectFetchWindow(items, today)
  }, [itemIds])

  const query = api.investments.transactions.useQuery(fetchRange ?? { startDate: '', endDate: '' }, {
    enabled: fetchRange !== null,
    // The feed's own sync is the refresh trigger; this must not refetch 24 months on every
    // remount. Cached rows in MMKV cover the gap between fetches.
    staleTime: 5 * 60 * 1000,
    onSuccess: (result) => {
      if (!fetchRange) return
      const failed = new Set(result.itemErrors.map((e) => e.itemId))
      // No decision logic here on purpose: resolveItemOutcome (lib/investments/window.ts) is
      // the single, tested place that decides what a failed vs. successful, narrowed vs.
      // sufficient fetch should do to this item's cache, marker and failure count. This loop
      // only gathers that item's pre-fetch state, asks resolveItemOutcome what to do, and
      // performs exactly the three writes it dictates — so a wrong decision (e.g. stamping
      // backfilledThrough from a narrowed success) can't be reintroduced here without also
      // breaking resolveItemOutcome's own tests.
      for (const itemId of itemIds) {
        const outcome = resolveItemOutcome({
          failed: failed.has(itemId),
          backfilledThrough: getInvestmentBackfilledThrough(itemId),
          failedAttempts: getInvestmentFailedAttempts(itemId),
          fetchRange,
        })
        setInvestmentFailedAttempts(itemId, outcome.nextFailedAttempts)
        if (outcome.cacheRows) {
          const rows = result.byItem[itemId] ?? []
          setCachedInvestmentTransactions(itemId, mergeInvestmentTransactions(getCachedInvestmentTransactions(itemId), rows))
        }
        if (outcome.advanceMarker) {
          setInvestmentBackfilledThrough(itemId, fetchRange.endDate)
        }
      }
      setFetchCompletedAt(Date.now())
    },
  })

  const transactions = useMemo(
    () => itemIds.flatMap((itemId) => getCachedInvestmentTransactions(itemId)),
    // Re-derive whenever a fetch completes, since MMKV writes happen as a side effect of the
    // query's onSuccess rather than through React state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemIds, fetchCompletedAt],
  )

  // No isLoading: investment rows are read from MMKV and render as soon as they exist, so no
  // caller has a spinner to gate on it — the feed's own loading state covers the screen.
  return { transactions, itemErrors: query.data?.itemErrors ?? [] }
}
