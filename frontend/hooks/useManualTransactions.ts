import { api } from '@/lib/api/client'

export function useManualTransactions() {
  const utils = api.useUtils()
  const manualTransactions = api.manualTransactions.list.useQuery()
  const createMutation = api.manualTransactions.create.useMutation({ onSuccess: () => utils.manualTransactions.list.invalidate() })
  const updateMutation = api.manualTransactions.update.useMutation({ onSuccess: () => utils.manualTransactions.list.invalidate() })
  const deleteMutation = api.manualTransactions.delete.useMutation({ onSuccess: () => utils.manualTransactions.list.invalidate() })

  return {
    data: manualTransactions.data,
    isLoading: manualTransactions.isLoading,
    // Distinct from isLoading (the list query): the write state a save button can spin on.
    isSaving: createMutation.isLoading || updateMutation.isLoading || deleteMutation.isLoading,
    error: manualTransactions.error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
