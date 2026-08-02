import { api } from '@/lib/api/client'

export function useAccounts() {
  const accounts = api.accounts.list.useQuery()

  return {
    data: accounts.data,
    isLoading: accounts.isLoading,
    error: accounts.error,
  }
}
