import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { useBudgets } from '@/hooks/useBudgets'
import { useCategories } from '@/hooks/useCategories'
import { deliverBudgetAlerts } from '@/lib/budgets/deliverAlerts'

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
 * Foreground half of budget alerting: watches the month's spending against every budget with an
 * alert line while the app is open and delivers crossings as local notifications. The background
 * task (lib/background/budgetAlertTask.ts) covers the app-closed case with the same shared
 * delivery logic, so a crossing is announced exactly once whichever side sees it first.
 *
 * canPrompt: the OS permission prompt may fire from here — it lands while the user is looking
 * at the app, right after they opted into an alert, instead of on some unrelated launch.
 */
export function useBudgetAlerts() {
  const { feed } = useTransactionFeed()
  const budgets = useBudgets()
  const categories = useCategories()

  useEffect(() => {
    if (!budgets.data || !categories.data) return
    void deliverBudgetAlerts({ feed, budgets: budgets.data, categories: categories.data, canPrompt: true })
  }, [feed, budgets.data, categories.data])
}
