import { useCallback, useMemo, useState } from 'react'
import { router } from 'expo-router'
import { api } from '@/lib/api/client'
import { useAccounts } from '@/hooks/useAccounts'
import { useLinkSession } from '@/hooks/useLinkSession'
import { usePlaidCredentials } from '@/hooks/usePlaidCredentials'

/**
 * The "+" flow, shared by both accounts screens so the two stay in step: open the picker, route
 * an existing bank into update mode and a new one into create mode.
 *
 * Reconnecting a broken item goes through the same update-mode call as managing accounts — from
 * Plaid's side they are the same request, differing only in whether account selection is enabled.
 */
export function useAddAccountFlow() {
  const [pickerOpen, setPickerOpen] = useState(false)
  const credentials = usePlaidCredentials()
  const accounts = useAccounts()
  const institutions = api.accounts.listInstitutions.useQuery()
  const { openCreateLink, openUpdateLink, isConnecting, error, setError } = useLinkSession()

  // Disconnected institutions are managed in Settings, where reconnecting them lives — offering
  // them here would conflate "share more accounts" with "turn this connection back on".
  const connectedInstitutions = useMemo(
    () => (institutions.data ?? []).filter((institution) => !institution.disabled),
    [institutions.data],
  )

  const logoByItemId = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const account of accounts.data ?? []) {
      if (!map.get(account.itemId)) map.set(account.itemId, account.institutionLogo)
    }
    return map
  }, [accounts.data])

  /** Plaid keys come first — without them there is nothing to open Link with. */
  const requireCredentials = useCallback(() => {
    if (credentials.isLoading) return false
    if (!credentials.data) {
      router.push('/(tabs)/settings/plaid-account')
      return false
    }
    return true
  }, [credentials.isLoading, credentials.data])

  const beginAddAccount = useCallback(() => {
    setError(null)
    if (!requireCredentials()) return
    setPickerOpen(true)
  }, [requireCredentials, setError])

  /** First-run path: there are no connected banks to choose between yet. */
  const connectFirstAccount = useCallback(() => {
    setError(null)
    if (!requireCredentials()) return
    void openCreateLink()
  }, [requireCredentials, openCreateLink, setError])

  const connectNewBank = useCallback(() => {
    setPickerOpen(false)
    void openCreateLink()
  }, [openCreateLink])

  const manageInstitution = useCallback(
    (itemId: string) => {
      setPickerOpen(false)
      void openUpdateLink(itemId, { accountSelection: true })
    },
    [openUpdateLink],
  )

  /**
   * Re-authenticate an item Plaid has stopped accepting (ITEM_LOGIN_REQUIRED). Distinct from the
   * accounts.reconnectInstitution procedure, which only clears a local disconnect flag and needs
   * no Link session at all.
   */
  const repairConnection = useCallback(
    (itemId: string) => {
      setError(null)
      if (!requireCredentials()) return
      void openUpdateLink(itemId)
    },
    [requireCredentials, openUpdateLink, setError],
  )

  return {
    pickerOpen,
    closePicker: () => setPickerOpen(false),
    connectedInstitutions,
    logoByItemId,
    beginAddAccount,
    connectFirstAccount,
    connectNewBank,
    manageInstitution,
    repairConnection,
    isConnecting: isConnecting || credentials.isLoading,
    error,
    setError,
  }
}
