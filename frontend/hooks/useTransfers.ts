import { api } from '@/lib/api/client'

export function useTransfers() {
  const utils = api.useUtils()
  const transfers = api.transfers.list.useQuery()
  const createMutation = api.transfers.create.useMutation({ onSuccess: () => utils.transfers.list.invalidate() })
  const deleteMutation = api.transfers.delete.useMutation({ onSuccess: () => utils.transfers.list.invalidate() })

  return {
    data: transfers.data,
    isLoading: transfers.isLoading,
    error: transfers.error,
    // Distinct from isLoading (the list query): this is what the save button spins on.
    isSaving: createMutation.isLoading || deleteMutation.isLoading,
    create: createMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
