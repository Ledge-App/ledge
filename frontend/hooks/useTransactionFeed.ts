import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api/client'
import { useAccounts } from './useAccounts'
import { useManualTransactions } from './useManualTransactions'
import { useTransactionOverrides } from './useTransactionOverrides'
import { useVendorMappings } from './useVendorMappings'
import { usePlaidCategoryMappings } from './usePlaidCategoryMappings'
import { useCategories } from './useCategories'
import { useTransfers } from './useTransfers'
import { useInvestmentTransactions } from './useInvestmentTransactions'
import {
  appendPendingRemovedTransactionIds,
  getCachedTransactions,
  getCursor,
  getPendingRemovedTransactionIds,
  setCachedTransactions,
  setCursor,
  setPendingRemovedTransactionIds,
} from '@/lib/storage/mmkv'
import { applyTransfers, mergeFeed } from '@/lib/transactions/resolveFeed'
import { planCachePrune } from '@/lib/transactions/pruneOrphaned'
import { applySweepExclusion } from '@/lib/transactions/sweepExclusion'
import { aggregateMonth } from '@/lib/transactions/aggregateMonth'
import { detectTransfers } from '@/lib/transfers/autoMatch'
import { findOrphanedTransfers } from '@/lib/transfers/orphanCleanup'
import { useTransferDismissals } from './useTransferDismissals'
import type { AutoMatchResult, TransferDraft } from '@/lib/transfers/autoMatch'
import type { PlaidTransaction } from '@/types/domain'

export interface TransferSuggestion extends TransferDraft {
  /**
   * 'high' drafts auto-apply (persisted as source-'auto' transfers without a tap); what
   * surfaces here is the 'medium' tier — plausible pairs that need a one-tap confirm.
   */
  confidence: 'high' | 'medium'
}

// Stable identity so the auto-apply effect doesn't re-fire while data is still loading.
const NO_DETECTION: AutoMatchResult = { autoApply: [], suggestions: [] }

function pairKey(draft: TransferDraft): string {
  return `${draft.expense.id}::${draft.income.id}`
}

export function useTransactionFeed() {
  const accounts = useAccounts()
  const manualTransactions = useManualTransactions()
  const overrides = useTransactionOverrides()
  const vendorMappings = useVendorMappings()
  const plaidCategoryMappings = usePlaidCategoryMappings()
  const categories = useCategories()
  const transfers = useTransfers()

  const itemIds = useMemo(() => Array.from(new Set((accounts.data ?? []).map((a) => a.itemId))), [accounts.data])

  const investmentTransactions = useInvestmentTransactions(itemIds)

  const accountIdToItemId = useMemo(() => {
    const map = new Map<string, string>()
    for (const account of accounts.data ?? []) map.set(account.account_id, account.itemId)
    return map
  }, [accounts.data])

  // Bumped in the sync mutation's onSuccess, after the MMKV writes land, so the
  // rawTransactions memo below re-reads the cache. MMKV writes are a side effect
  // outside React state, so this timestamp is what makes them observable.
  const [syncCompletedAt, setSyncCompletedAt] = useState(0)

  const liveAccountIdsByItem = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const account of accounts.data ?? []) {
      const ids = map.get(account.itemId) ?? new Set<string>()
      ids.add(account.account_id)
      map.set(account.itemId, ids)
    }
    return map
  }, [accounts.data])

  const failedItemIds = useMemo(
    () => new Set(accounts.itemErrors.map((itemError) => itemError.itemId)),
    [accounts.itemErrors],
  )

  // Drops transactions belonging to accounts the user has stopped sharing. Update mode lets an
  // institution's account set shrink without the connection being replaced, so nothing else
  // would ever evict them — see planCachePrune, including why failed items are left alone.
  useEffect(() => {
    if (accounts.isLoading || !accounts.data) return
    const cachedByItem = new Map(itemIds.map((itemId) => [itemId, getCachedTransactions(itemId)]))
    const plan = planCachePrune({ itemIds, cachedByItem, liveAccountIdsByItem, failedItemIds })
    if (plan.size === 0) return
    for (const [itemId, kept] of plan) setCachedTransactions(itemId, kept)
    // Same observability trick as a completed sync: the writes above happen outside React.
    setSyncCompletedAt(Date.now())
  }, [accounts.isLoading, accounts.data, itemIds, liveAccountIdsByItem, failedItemIds])

  // The backend bounds each sync request's pages per item and reports per-item hasMore
  // when an item isn't drained (e.g. a freshly linked account's full history). onSuccess
  // keeps re-syncing until every item is drained. The counter is a backstop against a
  // server that never stops reporting hasMore; it resets on every user/effect-initiated
  // sync. 20 rounds x 10 pages x 500 transactions is far beyond any real backlog.
  const drainRoundsRef = useRef(0)
  const MAX_DRAIN_ROUNDS = 20

  // transactions.sync is a mutation, not a query: it advances a stateful per-item Plaid
  // cursor. As a useQuery, the cursors input was part of the react-query cache key, so
  // every completed sync re-keyed the query (new cache entry + possible refetch loop).
  const syncMutation = api.transactions.sync.useMutation({
    onSuccess: (result) => {
      const byItem = new Map<string, PlaidTransaction[]>()
      for (const itemId of itemIds) byItem.set(itemId, getCachedTransactions(itemId))

      const removedIds = new Set(result.removed.map((r) => r.transaction_id))
      const modifiedIds = new Set(result.modified.map((t) => t.transaction_id))

      // Keyed by transaction_id so the merge is idempotent: re-running this handler with
      // the same payload (retry, double invocation) overwrites rather than duplicating.
      const mergedByItem = new Map<string, Map<string, PlaidTransaction>>()
      for (const [itemId, cached] of byItem) {
        const map = new Map<string, PlaidTransaction>()
        for (const txn of cached) {
          if (removedIds.has(txn.transaction_id) || modifiedIds.has(txn.transaction_id)) continue
          map.set(txn.transaction_id, txn)
        }
        mergedByItem.set(itemId, map)
      }

      for (const txn of [...result.added, ...result.modified]) {
        const itemId = accountIdToItemId.get(txn.account_id)
        if (!itemId) continue
        const map = mergedByItem.get(itemId) ?? new Map<string, PlaidTransaction>()
        map.set(txn.transaction_id, txn)
        mergedByItem.set(itemId, map)
      }

      for (const [itemId, map] of mergedByItem) setCachedTransactions(itemId, Array.from(map.values()))
      for (const [itemId, cursor] of Object.entries(result.cursors)) setCursor(itemId, cursor)
      // Queue removals durably BEFORE announcing the sync: Plaid emits each removal exactly
      // once, and after the merge above the transaction is gone from the cache — this queue
      // is the only remaining evidence a transfer referencing it must be dissolved (orphan
      // sweep below). MMKV so an app death here can't lose it.
      appendPendingRemovedTransactionIds(result.removed.map((r) => r.transaction_id))
      setSyncCompletedAt(Date.now())

      // Keep draining while the backend reports any item has more pages. Cursors were
      // just persisted above, so this continuation resumes exactly where this response
      // ended. All items' cursors are sent (not only the undrained ones): the backend
      // syncs every linked item, and an omitted cursor would re-download that item's
      // entire history from scratch.
      if (Object.values(result.hasMore ?? {}).some(Boolean) && drainRoundsRef.current < MAX_DRAIN_ROUNDS) {
        drainRoundsRef.current += 1
        const cursors: Record<string, string> = {}
        for (const itemId of itemIds) {
          const cursor = getCursor(itemId)
          if (cursor) cursors[itemId] = cursor
        }
        runSync({ cursors })
      }
    },
  })

  const { mutate: runSync } = syncMutation

  // Reads cursors fresh from MMKV at trigger time rather than memoizing them, so a sync
  // never resends a cursor that a previous sync already advanced past.
  const triggerSync = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      // A fresh user/effect-initiated sync starts a new drain sequence.
      drainRoundsRef.current = 0
      const cursors: Record<string, string> = {}
      for (const itemId of ids) {
        const cursor = getCursor(itemId)
        if (cursor) cursors[itemId] = cursor
      }
      runSync({ cursors })
    },
    [runSync],
  )

  useEffect(() => {
    triggerSync(itemIds)
  }, [itemIds, triggerSync])

  const rawTransactions = useMemo(
    () => itemIds.flatMap((itemId) => getCachedTransactions(itemId)),
    // Re-derive whenever a sync completes, since MMKV writes happen as a side effect
    // of the mutation rather than through React state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemIds, syncCompletedAt],
  )

  // plaidCategoryMappings is gated alongside the others rather than defaulted to []: resolving
  // with an empty mapping list would render a feed full of Uncategorized rows, then re-render
  // them categorized once the query lands. Better to hold the feed empty for one tick.
  const feed = useMemo(() => {
    if (!manualTransactions.data || !overrides.data || !vendorMappings.data || !plaidCategoryMappings.data) return []
    const merged = mergeFeed(
      rawTransactions,
      manualTransactions.data,
      overrides.data,
      vendorMappings.data,
      plaidCategoryMappings.data,
      // Drives isBrokerageCashAccount, which scopes the sweep exclusion in totals.ts. Not gated
      // above: with accounts still loading there are no cached transactions to classify either,
      // since itemIds comes from the same query.
      accounts.data ?? [],
      investmentTransactions.transactions,
    )
    const withTransfers = applyTransfers(merged, transfers.data ?? [])
    // Last in the chain, deliberately: it only touches brokerage-cash outflows that applyTransfers
    // left unpaired, so it can never override a transfer that auto-applied or the user confirmed.
    return applySweepExclusion(withTransfers)
  }, [
    rawTransactions,
    manualTransactions.data,
    overrides.data,
    vendorMappings.data,
    plaidCategoryMappings.data,
    accounts.data,
    investmentTransactions.transactions,
    transfers.data,
  ])

  const categoryById = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data])

  // Delegates to the shared aggregator rather than recomputing inline, so these numbers
  // can never drift from what Dashboard, Budgets and the Transactions calendar show.
  const aggregate = useMemo(() => aggregateMonth(feed), [feed])

  // Automatic internal-transfer detection over the FULL cache, not just the sync delta
  // (docs/credit-card-payment-auto-transfer.md). Full-cache detection is what makes the
  // account-link scan automatic — a newly linked account's history lands in the cache via
  // sync and the next pass pairs it against everything, old or new, whichever leg carries
  // the tag — and it closes the cross-session gap where the tagged leg synced in an earlier
  // session and delta-only driving would never revisit it. Cost is fine: the index build is
  // O(eligible) either way and drivers are pre-filtered to transfer-tagged items.
  //
  // The gate on loaded data is load-bearing: detecting before transfers/dismissals
  // arrive would see already-linked legs as unlinked and re-create them
  // (the DB's partial-unique indexes are the backstop, but don't lean on the backstop).
  const dismissals = useTransferDismissals()
  const detection = useMemo<AutoMatchResult>(() => {
    if (feed.length === 0 || !accounts.data?.length) return NO_DETECTION
    if (!transfers.data || !dismissals.data) return NO_DETECTION
    const dismissedIds = new Set(dismissals.data.map((d) => d.expensePlaidTransactionId))
    return detectTransfers({ feed, accounts: accounts.data, dismissedIds })
  }, [feed, accounts.data, transfers.data, dismissals.data])

  // AUTO-APPLY: persist high-confidence drafts as source-'auto' transfers. postedPairsRef
  // stops re-posting the same pair while the transfers.list invalidation is in flight
  // (fresh list data re-stamps the legs and detection stops producing the draft). A pair
  // whose POST fails stays counted and is retried next session — the safe direction.
  const postedPairsRef = useRef(new Set<string>())
  const createManyTransfers = transfers.createMany
  useEffect(() => {
    const fresh = detection.autoApply.filter((draft) => !postedPairsRef.current.has(pairKey(draft)))
    if (fresh.length === 0) return
    for (const draft of fresh) postedPairsRef.current.add(pairKey(draft))
    const rows = fresh.map((draft) => ({
      kind: draft.kind,
      expensePlaidTransactionId: draft.expense.id,
      incomePlaidTransactionId: draft.income.id,
      amount: draft.amount.toFixed(2),
    }))
    void (async () => {
      // Chunked to the router's batch bound; sequential so a backfill can't stampede.
      for (let i = 0; i < rows.length; i += 100) {
        try {
          await createManyTransfers({ transfers: rows.slice(i, i + 100) })
        } catch {
          // Best-effort by design: the pairs stay counted (never wrongly hidden) and the
          // next app session re-detects and retries them.
          break
        }
      }
    })()
  }, [detection, createManyTransfers])

  // The medium tier: plausible pairs that need a one-tap confirm, never auto-persisted.
  const transferSuggestions = useMemo<TransferSuggestion[]>(
    () => detection.suggestions.map((draft) => ({ ...draft, confidence: 'medium' as const })),
    [detection],
  )

  // ORPHAN SWEEP (phase 6): dissolve transfers whose leg Plaid retracted (queued durably in
  // onSuccess above) or whose auto-paired amounts drifted after a `modified`. Deleting goes
  // through transfers.delete, NOT unmark — no dismissal is written, because the pair wasn't
  // rejected by the user, it ceased to exist; a corrected re-post must be free to re-match.
  // Convergence: a queued id stays until no transfer references it, which only becomes true
  // through the refetched list after a successful delete — so a failed delete retries on the
  // next pass instead of being lost.
  const orphanSweepBusyRef = useRef(false)
  const deleteTransfer = transfers.delete
  useEffect(() => {
    if (!transfers.data) return
    const pendingRemovedIds = getPendingRemovedTransactionIds()
    const feedById = new Map(feed.map((item) => [item.id, item]))
    const { dissolveTransferIds, clearableRemovedIds } = findOrphanedTransfers({
      transfers: transfers.data,
      feedById,
      pendingRemovedIds,
    })
    if (clearableRemovedIds.length > 0) {
      const clearable = new Set(clearableRemovedIds)
      setPendingRemovedTransactionIds(pendingRemovedIds.filter((id) => !clearable.has(id)))
    }
    if (dissolveTransferIds.length === 0 || orphanSweepBusyRef.current) return
    orphanSweepBusyRef.current = true
    void (async () => {
      try {
        for (const id of dissolveTransferIds) {
          try {
            await deleteTransfer({ id })
          } catch {
            // Leave the queue untouched; the next pass retries this transfer.
          }
        }
      } finally {
        orphanSweepBusyRef.current = false
      }
    })()
  }, [feed, transfers.data, deleteTransfer])

  return {
    feed,
    categoryById,
    transferSuggestions,
    spendByCategory: aggregate.spendByCategory,
    spendByDay: aggregate.spendByDay,
    isLoading:
      accounts.isLoading ||
      manualTransactions.isLoading ||
      overrides.isLoading ||
      vendorMappings.isLoading ||
      plaidCategoryMappings.isLoading ||
      categories.isLoading ||
      // The sync blocks first paint only when there is nothing cached to paint — a first run
      // (or fresh install) has no transactions until the initial sync lands. Every later open
      // renders the MMKV cache immediately and lets the sync land in the background; the feed
      // re-derives off syncCompletedAt when it does.
      (syncMutation.isLoading && rawTransactions.length === 0),
    error:
      accounts.error ??
      manualTransactions.error ??
      overrides.error ??
      vendorMappings.error ??
      plaidCategoryMappings.error ??
      categories.error ??
      syncMutation.error,
    // MUST NOT be rendered as-is. The investments endpoint is called for every linked item
    // regardless of whether its institution supports the product, so every user with a plain
    // bank carries a permanent PRODUCTS_NOT_SUPPORTED entry here that means nothing to them.
    // The array is kept because the sync errors in it are genuinely diagnostic; any UI that
    // surfaces it must first filter down to the codes that are actionable for the user.
    itemErrors: [...(syncMutation.data?.itemErrors ?? []), ...investmentTransactions.itemErrors],
    refresh: () => triggerSync(itemIds),
  }
}
