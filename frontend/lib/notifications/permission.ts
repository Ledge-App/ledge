import * as Notifications from 'expo-notifications'

export interface NotificationPermission {
  granted: boolean
  /** False once the user has denied: iOS gives one prompt, and Settings is the only way back. */
  canAskAgain: boolean
}

export async function readNotificationPermission(): Promise<NotificationPermission> {
  const { granted, canAskAgain } = await Notifications.getPermissionsAsync()
  return { granted, canAskAgain }
}

/**
 * The one place the OS prompt is raised, so every caller gets the same rules: never ask twice,
 * never ask after a denial, and never ask from a context that can't show a dialog.
 *
 * `canPrompt` is the caller's claim that a prompt would make sense right now — a background wake
 * passes false (iOS rejects it, and a prompt with nobody looking is noise), anything driven by a
 * user action passes true. Returns whether we ended up with permission either way, so callers can
 * treat "already granted" and "just granted" identically.
 */
export async function ensureNotificationPermission({ canPrompt }: { canPrompt: boolean }): Promise<boolean> {
  const { granted, canAskAgain } = await readNotificationPermission()
  if (granted) return true
  if (!canAskAgain || !canPrompt) return false
  return (await Notifications.requestPermissionsAsync()).granted
}
