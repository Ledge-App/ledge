import { api } from '@/lib/api/client'

export function useAccounts() {
  const accounts = api.accounts.list.useQuery()

  return {
    // Unwrapped so callers keep receiving the plain account array they always have.
    data: accounts.data?.accounts,
    // Institutions the backend could not reach. These are per-item failures, not a failed
    // query — the rest of the accounts are still live, so this is surfaced separately from
    // `error` rather than blanking the screen.
    itemErrors: accounts.data?.itemErrors ?? [],
    isLoading: accounts.isLoading,
    error: accounts.error,
  }
}
