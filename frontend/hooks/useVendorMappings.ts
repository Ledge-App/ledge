import { api } from '@/lib/api/client'

export function useVendorMappings() {
  const utils = api.useUtils()
  const vendorMappings = api.vendorMappings.list.useQuery()
  const upsertMutation = api.vendorMappings.upsert.useMutation({ onSuccess: () => utils.vendorMappings.list.invalidate() })
  const bulkRecategorizeMutation = api.vendorMappings.bulkRecategorize.useMutation({
    onSuccess: () => utils.vendorMappings.list.invalidate(),
  })

  return {
    data: vendorMappings.data,
    isLoading: vendorMappings.isLoading,
    error: vendorMappings.error,
    upsert: upsertMutation.mutateAsync,
    bulkRecategorize: bulkRecategorizeMutation.mutateAsync,
  }
}
