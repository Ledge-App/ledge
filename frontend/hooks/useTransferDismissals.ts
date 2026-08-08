import { api } from '@/lib/api/client'

// "This outflow is NOT a transfer" memory. Auto-detection skips dismissed legs on both the
// driver and candidate side, so an unmarked pair is never resurrected by the next scan.
export function useTransferDismissals() {
  const utils = api.useUtils()
  const dismissals = api.transferDismissals.list.useQuery()
  const createMutation = api.transferDismissals.create.useMutation({
    onSuccess: (_data, variables) => {
      // Seed the cache synchronously (then reconcile via invalidate): unmark deletes the
      // transfer right after dismissing, and if the transfers refetch lands before the
      // dismissals refetch, one detection pass would see unstamped legs with no dismissal
      // and auto-apply would resurrect the pair the user just removed.
      utils.transferDismissals.list.setData(undefined, (old) => {
        if (!old || old.some((d) => d.expensePlaidTransactionId === variables.expensePlaidTransactionId)) return old
        return [...old, { id: `local-${variables.expensePlaidTransactionId}`, expensePlaidTransactionId: variables.expensePlaidTransactionId }]
      })
      void utils.transferDismissals.list.invalidate()
    },
  })

  return {
    data: dismissals.data,
    isLoading: dismissals.isLoading,
    error: dismissals.error,
    create: createMutation.mutateAsync,
  }
}
