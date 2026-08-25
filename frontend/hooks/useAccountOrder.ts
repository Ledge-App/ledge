import { useCallback } from 'react'
import { api } from '@/lib/api/client'
import { applyGroupOrder, toPositionMap } from '@/lib/accounts/order'

/**
 * The user's saved account order, plus the mutation that rewrites one group's worth of it.
 *
 * Kept separate from useAccounts rather than folded into accounts.list: that query is the
 * root of the transaction feed and gates first paint, and this is a small local table that
 * changes on a completely different cadence.
 */
export function useAccountOrder() {
  const utils = api.useUtils()
  const query = api.accountOrders.list.useQuery()
  const mutation = api.accountOrders.setOrder.useMutation({
    // Optimistic, because the row is already sitting where the user dropped it. Waiting for
    // the round trip would snap it back to the old position and then jump forward again.
    onMutate: async ({ accountIds }) => {
      await utils.accountOrders.list.cancel()
      const previous = utils.accountOrders.list.getData()
      utils.accountOrders.list.setData(undefined, (old) => applyGroupOrder(old ?? [], accountIds))
      return { previous }
    },
    onError: (_error, _input, context) => {
      // Put the server's order back rather than leaving the UI asserting a move that failed.
      if (context?.previous) utils.accountOrders.list.setData(undefined, context.previous)
    },
    // Refetch regardless: another device may have reordered a different group, and the
    // server is what reconciles them.
    onSettled: () => utils.accountOrders.list.invalidate(),
  })

  const setOrder = useCallback(
    (accountIds: string[]) => mutation.mutateAsync({ accountIds }),
    [mutation],
  )

  return {
    positionByAccountId: toPositionMap(query.data ?? []),
    setOrder,
    error: mutation.error?.message ?? null,
    resetError: mutation.reset,
  }
}
