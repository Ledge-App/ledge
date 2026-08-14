import * as BackgroundTask from 'expo-background-task'
import * as TaskManager from 'expo-task-manager'
import { createHeadlessApiClient } from '@/lib/api/client'
import { supabaseAuth } from '@/lib/supabase/auth'
import {
  appendPendingRemovedTransactionIds,
  getCachedInvestmentTransactions,
  getCachedTransactions,
  getCursor,
  setCachedTransactions,
  setCursor,
} from '@/lib/storage/mmkv'
import { planSyncMerge } from '@/lib/transactions/planSyncMerge'
import { applyTransfers, mergeFeed } from '@/lib/transactions/resolveFeed'
import { applySweepExclusion } from '@/lib/transactions/sweepExclusion'
import { deliverBudgetAlerts } from '@/lib/budgets/deliverAlerts'
import { resolveBudgetsForMonth } from '@/lib/budgets/budgetMath'

export const BUDGET_ALERT_TASK = 'budget-alert-sync'

// Background wakes are short (~30s) and infrequent; a fresh install's history backlog is the
// foreground's job. Three rounds cover any realistic day's delta.
const MAX_BACKGROUND_DRAIN_ROUNDS = 3

/**
 * The app-closed half of budget alerting: iOS wakes the app in the background, this syncs new
 * transactions from Plaid into the same MMKV cache the app reads, resolves the feed with the
 * same pure pipeline the foreground uses, and delivers any newly crossed alert lines as local
 * notifications. Transactions still never leave the device — the "server" here is our own
 * backend proxying Plaid, exactly as when the app is open.
 *
 * Everything is best-effort: any failure returns Failed and the next wake retries. The MMKV
 * fired-marks shared with the foreground watcher guarantee a crossing is announced only once
 * no matter which side sees it first.
 */
export async function runBudgetAlertCheck(): Promise<'delivered' | 'no-alerts' | 'skipped'> {
  const { data } = await supabaseAuth.auth.getSession()
  if (!data.session) return 'skipped'

  const client = createHeadlessApiClient()

  // Budgets first: with no alert line armed this month there is nothing a sync could surface,
  // so skip the heavy work entirely — background seconds are rationed by the OS.
  const budgets = await client.budgets.list.query()
  const today = new Date()
  const resolved = resolveBudgetsForMonth(budgets, { year: today.getFullYear(), month: today.getMonth() + 1 })
  if (![...resolved.values()].some((b) => b.alertThreshold != null)) return 'skipped'

  const [accountsResult, categories, manualTransactions, overrides, vendorMappings, plaidCategoryMappings, transfers] =
    await Promise.all([
      client.accounts.list.query(),
      client.categories.list.query(),
      client.manualTransactions.list.query(),
      client.transactionOverrides.list.query(),
      client.vendorMappings.list.query(),
      client.plaidCategoryMappings.list.query(),
      client.transfers.list.query(),
    ])

  const accounts = accountsResult.accounts
  const itemIds = Array.from(new Set(accounts.map((a) => a.itemId)))
  if (itemIds.length === 0) return 'skipped'
  const accountIdToItemId = new Map(accounts.map((a) => [a.account_id, a.itemId]))

  // Same drain loop as the foreground hook, same merge, same cursor discipline — planSyncMerge
  // is the shared single source of truth for how a sync response folds into the cache.
  for (let round = 0; round <= MAX_BACKGROUND_DRAIN_ROUNDS; round++) {
    const cursors: Record<string, string> = {}
    for (const itemId of itemIds) {
      const cursor = getCursor(itemId)
      if (cursor) cursors[itemId] = cursor
    }
    const result = await client.transactions.sync.mutate({ cursors })
    const cachedByItem = new Map(itemIds.map((itemId) => [itemId, getCachedTransactions(itemId)]))
    const plan = planSyncMerge(result, itemIds, accountIdToItemId, cachedByItem)
    for (const [itemId, merged] of plan.mergedByItem) setCachedTransactions(itemId, merged)
    for (const [itemId, cursor] of Object.entries(plan.cursors)) setCursor(itemId, cursor)
    // Queued for the foreground orphan sweep — the background task only reads transfers, it
    // never dissolves them; the next app open runs the sweep exactly as if it had synced this.
    appendPendingRemovedTransactionIds(plan.removedIds)
    if (!plan.hasMore) break
  }

  // Investment rows come from the MMKV cache rather than a fresh window fetch: they only affect
  // brokerage-cash classification (sweep exclusion), and the foreground refreshes them on open.
  const rawTransactions = itemIds.flatMap((itemId) => getCachedTransactions(itemId))
  const investmentTransactions = itemIds.flatMap((itemId) => getCachedInvestmentTransactions(itemId))
  const merged = mergeFeed(
    rawTransactions,
    manualTransactions,
    overrides,
    vendorMappings,
    plaidCategoryMappings,
    accounts,
    investmentTransactions,
  )
  const feed = applySweepExclusion(applyTransfers(merged, transfers))

  const delivered = await deliverBudgetAlerts({ feed, budgets, categories, canPrompt: false })
  return delivered > 0 ? 'delivered' : 'no-alerts'
}

TaskManager.defineTask(BUDGET_ALERT_TASK, async () => {
  try {
    await runBudgetAlertCheck()
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    // Transient by assumption (network, expired wake window); the next wake retries with the
    // same cursors, and planSyncMerge's idempotency makes a half-applied round harmless.
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

/**
 * Idempotent; called once from the root layout. iOS treats the interval as a floor, not a
 * schedule — real cadence is decided by the system (typically a few wakes a day for an app
 * that gets opened regularly).
 */
export async function registerBudgetAlertTask(): Promise<void> {
  try {
    await BackgroundTask.registerTaskAsync(BUDGET_ALERT_TASK, { minimumInterval: 60 * 3 })
  } catch {
    // Unavailable on this platform/build (e.g. web, or Background App Refresh disabled) —
    // the foreground watcher still covers every app open.
  }
}
