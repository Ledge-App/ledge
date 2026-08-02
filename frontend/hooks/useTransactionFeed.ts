import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api/client'
import { useAccounts } from './useAccounts'
import { useManualTransactions } from './useManualTransactions'
import { useTransactionOverrides } from './useTransactionOverrides'
import { useVendorMappings } from './useVendorMappings'
import { useCategories } from './useCategories'
import { useReimbursements } from './useReimbursements'
import { getCachedTransactions, setCachedTransactions, getCursor, setCursor } from '@/lib/storage/mmkv'
import { applyReimbursements, mergeFeed } from '@/lib/transactions/resolveFeed'
import { aggregateMonth } from '@/lib/transactions/aggregateMonth'
import type { PlaidTransaction } from '@/types/domain'

export function useTransactionFeed() {
  const accounts = useAccounts()
  const manualTransactions = useManualTransactions()
  const overrides = useTransactionOverrides()
  const vendorMappings = useVendorMappings()
  const categories = useCategories()
  const reimbursements = useReimbursements()

  const itemIds = useMemo(() => Array.from(new Set((accounts.data ?? []).map((a) => a.itemId))), [accounts.data])

  const accountIdToItemId = useMemo(() => {
    const map = new Map<string, string>()
    for (const account of accounts.data ?? []) map.set(account.account_id, account.itemId)
    return map
  }, [accounts.data])

  // Bumped in the sync mutation's onSuccess, after the MMKV writes land, so the
  // rawTransactions memo below re-reads the cache. MMKV writes are a side effect
  // outside React state, so this timestamp is what makes them observable.
  const [syncCompletedAt, setSyncCompletedAt] = useState(0)

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
      setSyncCompletedAt(Date.now())
    },
  })

  const { mutate: runSync } = syncMutation

  // Reads cursors fresh from MMKV at trigger time rather than memoizing them, so a sync
  // never resends a cursor that a previous sync already advanced past.
  const triggerSync = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
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

  const feed = useMemo(() => {
    if (!manualTransactions.data || !overrides.data || !vendorMappings.data) return []
    const merged = mergeFeed(rawTransactions, manualTransactions.data, overrides.data, vendorMappings.data)
    return applyReimbursements(merged, reimbursements.data ?? [])
  }, [rawTransactions, manualTransactions.data, overrides.data, vendorMappings.data, reimbursements.data])

  const categoryById = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data])

  // Delegates to the shared aggregator rather than recomputing inline, so these numbers
  // can never drift from what Dashboard, Budgets and the Transactions calendar show.
  const aggregate = useMemo(() => aggregateMonth(feed), [feed])

  return {
    feed,
    categoryById,
    spendByCategory: aggregate.spendByCategory,
    spendByDay: aggregate.spendByDay,
    isLoading:
      accounts.isLoading ||
      manualTransactions.isLoading ||
      overrides.isLoading ||
      vendorMappings.isLoading ||
      categories.isLoading ||
      syncMutation.isLoading,
    error:
      accounts.error ??
      manualTransactions.error ??
      overrides.error ??
      vendorMappings.error ??
      categories.error ??
      syncMutation.error,
    itemErrors: syncMutation.data?.itemErrors ?? [],
    refresh: () => triggerSync(itemIds),
  }
}
