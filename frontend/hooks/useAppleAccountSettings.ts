import { useCallback } from 'react'
import { Linking } from 'react-native'
import { financeKitDriver } from '@/lib/financekit/driver'
import { deriveAppleAccountStatus, type AppleAccountStatus } from '@/lib/financekit/status'
import { useFinanceKit } from '@/hooks/useFinanceKit'

export interface AppleAccountSettings {
  status: AppleAccountStatus
  /** How many Apple accounts are currently shared, for the connected line. */
  accountCount: number
  /** True while a read is in flight, so the control can hold still rather than flicking states. */
  isUpdating: boolean
  /** The only caller that raises the OS prompt. */
  connect: () => Promise<void>
  openSystemSettings: () => void
  remove: () => void
}

/**
 * The Apple-accounts equivalent of useNotificationSettings: collapses driver state into one named
 * status and exposes only the actions that status can honestly offer.
 */
export function useAppleAccountSettings(): AppleAccountSettings {
  const { snapshot, sync } = useFinanceKit()

  const connect = useCallback(async () => {
    await sync({ requestIfNeeded: true })
  }, [sync])

  const openSystemSettings = useCallback(() => void Linking.openSettings(), [])

  const remove = useCallback(() => {
    financeKitDriver.forget()
    // Straight to Settings, because forget() only clears our copy — iOS permission survives, so
    // without revoking there the accounts reappear on the next read.
    void Linking.openSettings()
  }, [])

  return {
    status: deriveAppleAccountStatus(snapshot),
    accountCount: snapshot.accounts.length,
    isUpdating: snapshot.isSyncing,
    connect,
    openSystemSettings,
    remove,
  }
}
