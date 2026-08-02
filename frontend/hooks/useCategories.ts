import { api } from '@/lib/api/client'

export function useCategories() {
  const utils = api.useUtils()
  const categories = api.categories.list.useQuery()
  const createMutation = api.categories.create.useMutation({ onSuccess: () => utils.categories.list.invalidate() })
  const updateMutation = api.categories.update.useMutation({ onSuccess: () => utils.categories.list.invalidate() })
  const deleteMutation = api.categories.delete.useMutation({ onSuccess: () => utils.categories.list.invalidate() })

  return {
    data: categories.data,
    isLoading: categories.isLoading,
    error: categories.error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
