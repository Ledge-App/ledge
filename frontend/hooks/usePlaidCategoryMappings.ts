import { api } from '@/lib/api/client'

export function usePlaidCategoryMappings() {
  const utils = api.useUtils()
  const mappings = api.plaidCategoryMappings.list.useQuery()
  const createMutation = api.plaidCategoryMappings.create.useMutation({
    onSuccess: () => utils.plaidCategoryMappings.list.invalidate(),
  })
  const updateMutation = api.plaidCategoryMappings.update.useMutation({
    onSuccess: () => utils.plaidCategoryMappings.list.invalidate(),
  })
  const deleteMutation = api.plaidCategoryMappings.delete.useMutation({
    onSuccess: () => utils.plaidCategoryMappings.list.invalidate(),
  })

  return {
    data: mappings.data,
    isLoading: mappings.isLoading,
    error: mappings.error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
