import { useMemo } from 'react'
import { api } from '@/lib/api/client'
import { sortAccountsByPreference } from '@/lib/accounts/order'
import { useAccountOrder } from '@/hooks/useAccountOrder'

export function useAccounts() {
  const accounts = api.accounts.list.useQuery()
  const { positionByAccountId } = useAccountOrder()

  // Sorted HERE rather than at each screen: every consumer of accounts goes through this
  // hook, so one sort is what keeps an account from sitting 2nd on the accounts screen and
  // 5th in the filter dropdown. Positions are per-group, but sorting the flat list is
  // equivalent — each screen slices groups out of this array and relative order survives.
  const sorted = useMemo(
    () => (accounts.data ? sortAccountsByPreference(accounts.data.accounts, positionByAccountId) : undefined),
    [accounts.data, positionByAccountId],
  )

  return {
    // Unwrapped so callers keep receiving the plain account array they always have.
    data: sorted,
    // Institutions the backend could not reach. These are per-item failures, not a failed
    // query — the rest of the accounts are still live, so this is surfaced separately from
    // `error` rather than blanking the screen.
    itemErrors: accounts.data?.itemErrors ?? [],
    isLoading: accounts.isLoading,
    error: accounts.error,
  }
}
