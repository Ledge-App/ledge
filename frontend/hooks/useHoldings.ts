import { api } from '@/lib/api/client'

/**
 * Holdings for one investment account, fetched only while its detail sheet is open —
 * holdings calls are per-item and slow-ish, and most sessions never look at them.
 */
export function useHoldings(input: { itemId: string; accountId: string } | null) {
  const query = api.investments.holdings.useQuery(
    { itemId: input?.itemId ?? '', accountId: input?.accountId ?? '' },
    { enabled: input != null },
  )
  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
