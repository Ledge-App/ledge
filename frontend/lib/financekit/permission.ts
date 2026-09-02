import type { FinanceKitModule } from './syncEngine'
import type { AuthorizationStatus } from './types'

/**
 * The one place the FinanceKit permission prompt is raised, so every caller gets the same rules —
 * the same reason lib/notifications/permission.ts exists.
 *
 * `canPrompt` is the caller's claim that a prompt would make sense right now: a launch sync or a
 * foreground refresh passes false, because a permission dialog nobody asked for is an ambush.
 * Only an explicit user action ("Connect", or the Apple row in the add-account sheet) passes true.
 *
 * Unlike notifications there is no `canAskAgain` to consult: FinanceKit reports `denied` and iOS
 * will not present the dialog a second time, so `denied` is terminal and Settings is the only way
 * back. That makes the rule simpler — prompt only from `notDetermined`.
 */
export async function ensureFinanceKitAccess(
  financeKit: FinanceKitModule,
  { canPrompt }: { canPrompt: boolean },
): Promise<AuthorizationStatus> {
  const status = await financeKit.authorizationStatus()
  if (status !== 'notDetermined' || !canPrompt) return status
  return financeKit.requestAuthorization()
}
