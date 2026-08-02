import { api } from '@/lib/api/client'

export function useSubcategories(categoryId?: string) {
  const utils = api.useUtils()
  const subcategories = api.subcategories.list.useQuery({ categoryId })
  const createMutation = api.subcategories.create.useMutation({ onSuccess: () => utils.subcategories.list.invalidate() })
  const updateMutation = api.subcategories.update.useMutation({ onSuccess: () => utils.subcategories.list.invalidate() })
  const deleteMutation = api.subcategories.delete.useMutation({ onSuccess: () => utils.subcategories.list.invalidate() })

  return {
    data: subcategories.data,
    isLoading: subcategories.isLoading,
    error: subcategories.error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
