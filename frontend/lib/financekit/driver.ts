import { AppState } from 'react-native'
import { createFinanceKitDriver } from './financeKitDriver'
import { financeKitModule } from './financeKitModule'

/**
 * The one FinanceKit driver instance. Separate from financeKitDriver.ts so the driver's own tests
 * never import expo-finance-kit or react-native.
 */
export const financeKitDriver = createFinanceKitDriver(financeKitModule)

/**
 * Re-read whenever the app comes back to the foreground, the same discipline
 * useNotificationSettings applies to notification permission — but load-bearing here rather than
 * defensive. Choosing *which* Apple accounts to share is only possible in iOS Settings, so leaving
 * the app and returning is the normal path to having data, and a stale snapshot would show an empty
 * state to someone who just fixed it.
 *
 * Registered here, at module scope, rather than in the hook: useAccounts is called from eight
 * components, and a listener per caller would mean eight reads per foreground.
 *
 * Forced, so the cooldown does not suppress exactly the read that matters most.
 */
AppState.addEventListener('change', (state) => {
  if (state === 'active') void financeKitDriver.syncNow({ force: true })
})
