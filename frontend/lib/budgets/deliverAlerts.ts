import * as Notifications from 'expo-notifications'
import { MMKV } from 'react-native-mmkv'
import { monthKey, resolveBudgetsForMonth } from '@/lib/budgets/budgetMath'
import { findCrossedAlerts } from '@/lib/budgets/alertCheck'
import { categoryIconEmoji } from '@/lib/categories/icons'
import { filterByMonth } from '@/lib/transactions/filterByMonth'
import { aggregateMonth } from '@/lib/transactions/aggregateMonth'
import { formatAmount } from '@/lib/format/money'
import type { Budget, Category } from '@/types/domain'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

const firedStore = new MMKV({ id: 'ledge-budget-alerts' })

/**
 * Compute this month's crossed budget alert lines from a resolved feed and deliver a local
 * notification for each, once per (budget, month, threshold) — the MMKV mark is shared between
 * the foreground watcher and the background task, so whichever sees a crossing first delivers
 * it and the other stays quiet.
 *
 * `canPrompt` gates the OS permission request: the foreground watcher may ask (the prompt lands
 * with obvious context — an alert is due), a background wake must not (iOS would reject it, and
 * a prompt with nobody looking is noise). Without permission the alerts stay unmarked, so
 * they're delivered the next time we run with permission granted.
 */
export async function deliverBudgetAlerts(input: {
  feed: FeedItem[]
  budgets: Budget[]
  categories: Category[]
  canPrompt: boolean
}): Promise<number> {
  const today = new Date()
  const month = { year: today.getFullYear(), month: today.getMonth() + 1 }
  const resolved = resolveBudgetsForMonth(input.budgets, month)
  if (resolved.size === 0) return 0

  const { spendByCategory } = aggregateMonth(filterByMonth(input.feed, month))
  const alerts = findCrossedAlerts(resolved, spendByCategory, monthKey(month), (key) => firedStore.getBoolean(key) ?? false)
  if (alerts.length === 0) return 0

  let { granted, canAskAgain } = await Notifications.getPermissionsAsync()
  if (!granted && canAskAgain && input.canPrompt) {
    granted = (await Notifications.requestPermissionsAsync()).granted
  }
  if (!granted) return 0

  const categoryById = new Map(input.categories.map((c) => [c.id, c]))
  let delivered = 0
  for (const alert of alerts) {
    // Re-check at delivery time: a concurrent invocation (foreground effect re-fired while this
    // one awaited the permission call) may have delivered this key after we computed the list.
    // No await sits between this check and the set below, so the pair is atomic in JS.
    if (firedStore.getBoolean(alert.key)) continue
    // Mark before sending: a duplicate alert is worse than a lost one.
    firedStore.set(alert.key, true)
    delivered += 1
    const category = categoryById.get(alert.categoryId)
    const name = category?.name ?? 'A category'
    const emoji = categoryIconEmoji(category?.icon)
    const over = alert.spent > alert.amount
    // Title is the app name (the bold first line); the alert itself lives in the body, which
    // iOS wraps freely. The category emoji leads the body so the glanceable part comes first.
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'ToFi',
        body: over
          ? `${emoji} ${name} is over budget — ${formatAmount(alert.spent)} spent of your ${formatAmount(alert.amount)} budget.`
          : `${emoji} ${name} passed your alert line — ${formatAmount(alert.spent)} spent, past your ${formatAmount(alert.thresholdDollars)} alert on a ${formatAmount(alert.amount)} budget.`,
      },
      trigger: null,
    })
  }
  return delivered
}
