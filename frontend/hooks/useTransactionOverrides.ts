import { api } from '@/lib/api/client'

export function useTransactionOverrides() {
  const utils = api.useUtils()
  const overrides = api.transactionOverrides.list.useQuery()
  const upsertMutation = api.transactionOverrides.upsert.useMutation({ onSuccess: () => utils.transactionOverrides.list.invalidate() })
  const deleteMutation = api.transactionOverrides.delete.useMutation({ onSuccess: () => utils.transactionOverrides.list.invalidate() })

  return {
    data: overrides.data,
    isLoading: overrides.isLoading,
    error: overrides.error,
    upsert: upsertMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
