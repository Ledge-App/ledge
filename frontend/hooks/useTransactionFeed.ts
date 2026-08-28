import { useContext } from 'react'
import { TransactionFeedContext, type TransactionFeedValue } from '@/components/transactions/TransactionFeedProvider'

export type { TransferSuggestion } from '@/components/transactions/TransactionFeedProvider'

/**
 * Reads the feed owned by TransactionFeedProvider.
 *
 * This used to BE the feed — 380 lines of derivation, effects and a Plaid drain loop, re-run in
 * full by each of the six screens that called it. The work now happens once in the provider and
 * this is a context read; the returned shape is unchanged.
 *
 * Throwing on a missing provider is the point: a consumer mounted outside the tabs layout would
 * otherwise silently get its own copy of everything again, which is the bug this replaced.
 */
export function useTransactionFeed(): TransactionFeedValue {
  const value = useContext(TransactionFeedContext)
  if (!value) throw new Error('useTransactionFeed must be used inside a TransactionFeedProvider.')
  return value
}
