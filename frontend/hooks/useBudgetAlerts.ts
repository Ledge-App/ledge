import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { MMKV } from 'react-native-mmkv'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { useBudgets } from '@/hooks/useBudgets'
import { useCategories } from '@/hooks/useCategories'
import { monthKey, resolveBudgetsForMonth } from '@/lib/budgets/budgetMath'
import { findCrossedAlerts } from '@/lib/budgets/alertCheck'
import { categoryIconEmoji } from '@/lib/categories/icons'
import { filterByMonth } from '@/lib/transactions/filterByMonth'
import { aggregateMonth } from '@/lib/transactions/aggregateMonth'
import { formatAmount } from '@/lib/format/money'

const firedStore = new MMKV({ id: 'ledge-budget-alerts' })

// Budget alerts should surface even while the app is open — without this iOS silently
// swallows notifications delivered to a foregrounded app.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

/**
 * Watches the month's spending against every budget with an alert line and delivers a local
 * notification the first time each line is crossed. Runs entirely on-device: transactions never
 * reach the server, so this is where alerting has to live. Fired alerts are remembered per
 * (budget, month, threshold) so a sync or app relaunch doesn't re-send them.
 */
export function useBudgetAlerts() {
  const { feed } = useTransactionFeed()
  const budgets = useBudgets()
  const categories = useCategories()

  useEffect(() => {
    const today = new Date()
    const month = { year: today.getFullYear(), month: today.getMonth() + 1 }
    const resolved = resolveBudgetsForMonth(budgets.data ?? [], month)
    if (resolved.size === 0) return

    const { spendByCategory } = aggregateMonth(filterByMonth(feed, month))
    const alerts = findCrossedAlerts(resolved, spendByCategory, monthKey(month), (key) => firedStore.getBoolean(key) ?? false)
    if (alerts.length === 0) return

    const categoryById = new Map((categories.data ?? []).map((c) => [c.id, c]))

    let cancelled = false
    ;(async () => {
      // Ask only when there's an alert to deliver — the user opted in per budget, so the OS
      // prompt arrives with obvious context instead of on some unrelated app launch.
      let { granted, canAskAgain } = await Notifications.getPermissionsAsync()
      if (!granted && canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted
      if (!granted || cancelled) return

      for (const alert of alerts) {
        // Mark before sending: a duplicate alert is worse than a lost one.
        firedStore.set(alert.key, true)
        const category = categoryById.get(alert.categoryId)
        const name = category?.name ?? 'A category'
        const emoji = categoryIconEmoji(category?.icon)
        const over = alert.spent > alert.amount
        await Notifications.scheduleNotificationAsync({
          content: {
            title: over ? `${emoji} ${name} is over budget` : `${emoji} ${name} passed your alert line`,
            body: over
              ? `${formatAmount(alert.spent)} spent of your ${formatAmount(alert.amount)} budget.`
              : `${formatAmount(alert.spent)} spent — past your ${formatAmount(alert.thresholdDollars)} alert on a ${formatAmount(alert.amount)} budget.`,
          },
          trigger: null,
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [feed, budgets.data, categories.data])
}
