import { api } from '@/lib/api/client'
import { useTransferDismissals } from './useTransferDismissals'

export function useTransfers() {
  const utils = api.useUtils()
  const transfers = api.transfers.list.useQuery()
  const dismissals = useTransferDismissals()
  // Patches the row the create already returned straight into the cache instead of
  // invalidating and re-fetching the whole list — removes a full network round-trip from
  // every save, since the response already has everything the list needs.
  const createMutation = api.transfers.create.useMutation({
    onSuccess: (created) => {
      utils.transfers.list.setData(undefined, (old) => [...(old ?? []), created])
    },
  })
  const createManyMutation = api.transfers.createMany.useMutation({ onSuccess: () => utils.transfers.list.invalidate() })
  const deleteMutation = api.transfers.delete.useMutation({ onSuccess: () => utils.transfers.list.invalidate() })

  // The one unmark path for every screen. Writes the dismissal BEFORE deleting — in that
  // order, a failure leaves the transfer marked (harmless); the reverse order has a window
  // where auto-detection could re-create the pair the user just removed. Dismissing on
  // every unmark (not only source 'auto') is deliberate: a manually created transfer whose
  // pair is auto-detectable would otherwise bounce straight back after the user removes it.
  const unmark = async ({ id }: { id: string }) => {
    const transfer = transfers.data?.find((t) => t.id === id)
    if (transfer?.expensePlaidTransactionId) {
      await dismissals.create({ expensePlaidTransactionId: transfer.expensePlaidTransactionId })
    }
    await deleteMutation.mutateAsync({ id })
  }

  return {
    data: transfers.data,
    isLoading: transfers.isLoading,
    error: transfers.error,
    // Distinct from isLoading (the list query): this is what the save button spins on.
    isSaving: createMutation.isLoading || deleteMutation.isLoading,
    create: createMutation.mutateAsync,
    // Auto-apply's bulk path (source 'auto' server-side); conflicts are skipped, not errors.
    createMany: createManyMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
    unmark,
  }
}
