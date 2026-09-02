import { useMemo } from 'react'
import { useAccounts } from './useAccounts'
import { FINANCEKIT_ITEM_ID } from '@/lib/financekit/mergeAccounts'

/**
 * What an account shows for itself on a transaction row: its institution's logo, or the Apple mark.
 *
 * Two cases rather than one nullable logo because Apple accounts have no logo and never will —
 * FinanceKit exposes none — yet they are the most identifiable brand in the list. Leaving them as
 * "no logo" dropped the chip entirely, so an Apple Card row was the only one on screen with nothing
 * naming the account it hit.
 */
export type AccountMark = { kind: 'logo'; logo: string } | { kind: 'apple' }

/**
 * accountId -> the mark to render beside a transaction's amount.
 *
 * Rides the shared accounts.list query cache — calling this in several components costs nothing
 * extra. Accounts with neither a logo nor an Apple item are simply absent from the map.
 */
export function useAccountMarks(): Map<string, AccountMark> {
  const accounts = useAccounts()
  return useMemo(() => {
    const map = new Map<string, AccountMark>()
    for (const account of accounts.data ?? []) {
      if (account.itemId === FINANCEKIT_ITEM_ID) map.set(account.account_id, { kind: 'apple' })
      else if (account.institutionLogo) map.set(account.account_id, { kind: 'logo', logo: account.institutionLogo })
    }
    return map
  }, [accounts.data])
}
