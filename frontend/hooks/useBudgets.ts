import { api } from '@/lib/api/client'

export function useBudgets() {
  const utils = api.useUtils()
  const budgets = api.budgets.list.useQuery()
  const setMutation = api.budgets.set.useMutation({ onSuccess: () => utils.budgets.list.invalidate() })
  const createMutation = api.budgets.create.useMutation({ onSuccess: () => utils.budgets.list.invalidate() })
  const updateMutation = api.budgets.update.useMutation({ onSuccess: () => utils.budgets.list.invalidate() })
  const deleteMutation = api.budgets.delete.useMutation({ onSuccess: () => utils.budgets.list.invalidate() })

  return {
    data: budgets.data,
    isLoading: budgets.isLoading,
    error: budgets.error,
    set: setMutation.mutateAsync,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
