import type { FinanceKitSnapshot } from './financeKitDriver'

/**
 * What the Apple accounts settings screen can offer, which depends on the OS as much as on us.
 * Mirrors NotificationStatus, with two states notifications has no analogue for:
 *
 * - `unavailable`  — the device or region cannot serve this data at all, so there is nothing to
 *                    offer and no action the user could take
 * - `no_accounts`  — ToFi has access but no Apple account is shared. iOS treats app access and
 *                    per-account sharing as two separate switches, which makes this the likeliest
 *                    real-world state, and its remedy differs from `blocked`
 */
export type AppleAccountStatus =
  | 'loading'
  | 'unavailable'
  | 'unprompted'
  | 'blocked'
  | 'no_accounts'
  | 'connected'

export function deriveAppleAccountStatus(snapshot: FinanceKitSnapshot): AppleAccountStatus {
  // Null status means no sync has completed yet, not that anything is wrong.
  if (snapshot.status === null) return 'loading'

  switch (snapshot.status) {
    case 'unavailable':
      return 'unavailable'
    case 'notDetermined':
      return 'unprompted'
    case 'denied':
    case 'restricted':
      return 'blocked'
    case 'authorized':
      // Authorized with nothing shared is not success: the accounts still have to be ticked in
      // iOS Settings, and until they are, every read comes back empty.
      return snapshot.accounts.length === 0 ? 'no_accounts' : 'connected'
  }
}
