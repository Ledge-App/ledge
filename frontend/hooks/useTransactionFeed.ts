import { useMemo, useState } from 'react'
import { api } from '@/lib/api/client'
import { useAccounts } from './useAccounts'
import { useManualTransactions } from './useManualTransactions'
import { useTransactionOverrides } from './useTransactionOverrides'
import { useVendorMappings } from './useVendorMappings'
import { useCategories } from './useCategories'
import { useReimbursements } from './useReimbursements'
import { getCachedTransactions, setCachedTransactions, getCursor, setCursor } from '@/lib/storage/mmkv'
import { applyReimbursements, mergeFeed } from '@/lib/transactions/resolveFeed'
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

  // Bumped in the sync query's onSuccess handler, after setCursor(...) persists the new
  // cursors to MMKV, so that `cursors` below re-reads MMKV instead of reusing the stale
  // value captured when itemIds last changed. Without this, refresh() would resend the
  // same cursor forever and duplicate transactions could accumulate in the cache.
  const [cursorVersion, setCursorVersion] = useState(0)

  const cursors = useMemo(() => {
    const map: Record<string, string> = {}
    for (const itemId of itemIds) {
      const cursor = getCursor(itemId)
      if (cursor) map[itemId] = cursor
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIds, cursorVersion])

  const sync = api.transactions.sync.useQuery(
    { cursors },
    {
      enabled: itemIds.length > 0,
      onSuccess: (result) => {
        const byItem = new Map<string, PlaidTransaction[]>()
        for (const itemId of itemIds) byItem.set(itemId, getCachedTransactions(itemId))

        const removedIds = new Set(result.removed.map((r) => r.transaction_id))
        const modifiedIds = new Set(result.modified.map((t) => t.transaction_id))

        for (const [itemId, cached] of byItem) {
          byItem.set(
            itemId,
            cached.filter((t) => !removedIds.has(t.transaction_id) && !modifiedIds.has(t.transaction_id)),
          )
        }

        for (const txn of [...result.added, ...result.modified]) {
          const itemId = accountIdToItemId.get(txn.account_id)
          if (!itemId) continue
          const bucket = byItem.get(itemId) ?? []
          bucket.push(txn)
          byItem.set(itemId, bucket)
        }

        for (const [itemId, transactions] of byItem) setCachedTransactions(itemId, transactions)
        for (const [itemId, cursor] of Object.entries(result.cursors)) setCursor(itemId, cursor)
        setCursorVersion((v) => v + 1)
      },
    },
  )

  const rawTransactions = useMemo(
    () => itemIds.flatMap((itemId) => getCachedTransactions(itemId)),
    // Re-derive whenever a sync completes (dataUpdatedAt changes), since MMKV writes
    // happen as a side effect of that query rather than through React state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemIds, sync.dataUpdatedAt],
  )

  const feed = useMemo(() => {
    if (!manualTransactions.data || !overrides.data || !vendorMappings.data) return []
    const merged = mergeFeed(rawTransactions, manualTransactions.data, overrides.data, vendorMappings.data)
    return applyReimbursements(merged, reimbursements.data ?? [])
  }, [rawTransactions, manualTransactions.data, overrides.data, vendorMappings.data, reimbursements.data])

  const categoryById = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data])

  const spendByCategory = useMemo(() => {
    const totals = new Map<string, number>()
    for (const item of feed) {
      if (item.amount <= 0 || !item.categoryId) continue
      const net = item.netAmount ?? item.amount
      totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + net)
    }
    return totals
  }, [feed])

  return {
    feed,
    categoryById,
    spendByCategory,
    isLoading:
      accounts.isLoading || manualTransactions.isLoading || overrides.isLoading || vendorMappings.isLoading || categories.isLoading,
    error: accounts.error ?? manualTransactions.error ?? overrides.error ?? vendorMappings.error ?? categories.error,
    itemErrors: sync.data?.itemErrors ?? [],
    refresh: () => sync.refetch(),
  }
}
