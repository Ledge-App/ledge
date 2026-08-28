import { api } from '@/lib/api/client'

export function useTransactionOverrides() {
  const utils = api.useUtils()
  const overrides = api.transactionOverrides.list.useQuery()
  // Same reasoning as transfers.create: the upsert already returns the row, so patch it in
  // directly rather than paying a second round-trip to re-fetch the list. It's an upsert, not
  // an append — replace any existing override for this transaction rather than duplicating it.
  const upsertMutation = api.transactionOverrides.upsert.useMutation({
    onSuccess: (saved) => {
      utils.transactionOverrides.list.setData(undefined, (old) => [
        ...(old ?? []).filter((o) => o.plaidTransactionId !== saved.plaidTransactionId),
        saved,
      ])
    },
  })
  const deleteMutation = api.transactionOverrides.delete.useMutation({ onSuccess: () => utils.transactionOverrides.list.invalidate() })

  return {
    data: overrides.data,
    isLoading: overrides.isLoading,
    error: overrides.error,
    upsert: upsertMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
