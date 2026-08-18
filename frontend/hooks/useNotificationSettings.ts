import { useCallback, useEffect, useState } from 'react'
import { AppState, Linking } from 'react-native'
import { ensureNotificationPermission, readNotificationPermission } from '@/lib/notifications/permission'
import { getBudgetAlertsEnabled, setBudgetAlertsEnabled } from '@/lib/notifications/preference'

/**
 * What the settings screen can offer, which depends on the OS as much as on us:
 *
 * - `on` / `off`   — permission granted, so the in-app switch is the only thing deciding delivery
 * - `unprompted`   — never asked (or asked and dismissed): the switch can still raise the prompt
 * - `blocked`      — denied at the OS level, and iOS won't let us ask twice, so the only honest
 *                    control left is a link into Settings
 */
export type NotificationStatus = 'loading' | 'on' | 'off' | 'unprompted' | 'blocked'

export interface NotificationSettings {
  status: NotificationStatus
  /** True while a prompt is in flight, so the row can hold still instead of flicking through states. */
  isUpdating: boolean
  setEnabled: (enabled: boolean) => Promise<void>
  openSystemSettings: () => void
}

export function useNotificationSettings(): NotificationSettings {
  const [permission, setPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null)
  const [enabled, setEnabled] = useState(getBudgetAlertsEnabled)
  const [isUpdating, setIsUpdating] = useState(false)

  // Permission can change out from under us — the Settings button leaves the app, and iOS's own
  // notification settings are two taps away at any time — so re-read whenever we come back to the
  // foreground rather than trusting what we read on mount.
  useEffect(() => {
    let active = true
    const refresh = () => {
      void readNotificationPermission().then((next) => {
        if (active) setPermission(next)
      })
    }
    refresh()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => {
      active = false
      subscription.remove()
    }
  }, [])

  const status: NotificationStatus = !permission
    ? 'loading'
    : permission.granted
      ? enabled
        ? 'on'
        : 'off'
      : permission.canAskAgain
        ? 'unprompted'
        : 'blocked'

  const update = useCallback(async (next: boolean) => {
    // Turning off is ours alone: iOS has no API for handing permission back, so the flag is what
    // stops delivery and the granted permission stays put underneath, ready for turning on again.
    if (!next) {
      setBudgetAlertsEnabled(false)
      setEnabled(false)
      return
    }
    setIsUpdating(true)
    try {
      const granted = await ensureNotificationPermission({ canPrompt: true })
      setPermission(await readNotificationPermission())
      // A denial leaves the flag alone rather than writing it on: the switch falls back to off,
      // and the screen moves to 'blocked' off the refreshed permission.
      if (!granted) return
      setBudgetAlertsEnabled(true)
      setEnabled(true)
    } finally {
      setIsUpdating(false)
    }
  }, [])

  return {
    status,
    isUpdating,
    setEnabled: update,
    openSystemSettings: useCallback(() => void Linking.openSettings(), []),
  }
}
