import { api } from '@/lib/api/client'

export function useVendorMappings() {
  const utils = api.useUtils()
  const vendorMappings = api.vendorMappings.list.useQuery()
  // Same reasoning as transfers.create/transactionOverrides.upsert: patch the returned row in
  // directly instead of re-fetching the whole list. Replace any existing mapping for this
  // vendor rather than appending, since the upsert itself is keyed on vendor name.
  const upsertMutation = api.vendorMappings.upsert.useMutation({
    onSuccess: (saved) => {
      utils.vendorMappings.list.setData(undefined, (old) => [
        ...(old ?? []).filter((v) => v.vendorName !== saved.vendorName),
        saved,
      ])
    },
  })
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
