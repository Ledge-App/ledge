import { MMKV } from 'react-native-mmkv'

const store = new MMKV({ id: 'ledge-notification-settings' })
const BUDGET_ALERTS_KEY = 'budgetAlertsEnabled'

/**
 * The in-app switch for budget alerts, separate from the OS permission.
 *
 * iOS has no API for revoking your own notification permission — an app can only ask for it. So
 * "turn alerts off" has to be our own flag that gates delivery, with the granted permission left
 * intact underneath; turning them back on is then a switch rather than a trip to Settings.
 *
 * Defaults to on: permission is only ever requested off the back of an alert the user armed, so
 * arriving here at all means they asked for alerts.
 */
export function getBudgetAlertsEnabled(): boolean {
  return store.getBoolean(BUDGET_ALERTS_KEY) ?? true
}

export function setBudgetAlertsEnabled(enabled: boolean): void {
  store.set(BUDGET_ALERTS_KEY, enabled)
}
