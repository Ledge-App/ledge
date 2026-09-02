import { useMemo } from 'react'
import { api } from '@/lib/api/client'
import { sortAccountsByPreference } from '@/lib/accounts/order'
import { useAccountOrder } from '@/hooks/useAccountOrder'
import { useFinanceKit } from '@/hooks/useFinanceKit'
import { mergeFinanceKitIntoAccounts } from '@/lib/financekit/mergeAccounts'

export function useAccounts() {
  const accounts = api.accounts.list.useQuery()
  const { positionByAccountId } = useAccountOrder()
  const financeKit = useFinanceKit()

  // Apple accounts join here rather than at each screen for the same reason the sort does: this is
  // the one funnel every account consumer passes through, so net worth, the accounts list, and the
  // filter dropdowns all pick them up without individually knowing FinanceKit exists.
  const merged = useMemo(
    () =>
      accounts.data
        ? mergeFinanceKitIntoAccounts(accounts.data, financeKit.snapshot.status
            ? { status: financeKit.snapshot.status, accounts: financeKit.snapshot.accounts }
            : null)
        : { accounts: undefined, itemErrors: [] },
    [accounts.data, financeKit.snapshot.status, financeKit.snapshot.accounts],
  )

  // Sorted HERE rather than at each screen: every consumer of accounts goes through this
  // hook, so one sort is what keeps an account from sitting 2nd on the accounts screen and
  // 5th in the filter dropdown. Positions are per-group, but sorting the flat list is
  // equivalent — each screen slices groups out of this array and relative order survives.
  const sorted = useMemo(
    () => (merged.accounts ? sortAccountsByPreference(merged.accounts, positionByAccountId) : undefined),
    [merged.accounts, positionByAccountId],
  )

  return {
    // Unwrapped so callers keep receiving the plain account array they always have.
    data: sorted,
    // Institutions the backend could not reach. These are per-item failures, not a failed
    // query — the rest of the accounts are still live, so this is surfaced separately from
    // `error` rather than blanking the screen.
    itemErrors: merged.itemErrors,
    isLoading: accounts.isLoading,
    error: accounts.error,
    /** FinanceKit transactions, ready for the feed. Empty unless Wallet access is authorized. */
    financeKitTransactions: financeKit.snapshot.transactions,
    /** Runs the FinanceKit read, optionally raising the Wallet permission prompt. */
    syncFinanceKit: financeKit.sync,
    financeKitStatus: financeKit.snapshot.status,
  }
}
