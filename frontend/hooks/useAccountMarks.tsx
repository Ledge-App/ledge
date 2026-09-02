import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useAccounts } from './useAccounts'
import { FINANCEKIT_ITEM_ID } from '@/lib/financekit/mergeAccounts'
import type { Account } from '@/types/domain'

/**
 * What an account shows for itself on a transaction row: its institution's logo, or the Apple mark.
 *
 * Two cases rather than one nullable logo because Apple accounts have no logo and never will —
 * FinanceKit exposes none — yet they are the most identifiable brand in the list. Leaving them as
 * "no logo" dropped the chip entirely, so an Apple Card row was the only one on screen with nothing
 * naming the account it hit.
 */
export type AccountMark = { kind: 'logo'; logo: string } | { kind: 'apple' }

/** accountId -> the mark to render beside a transaction's amount. */
export function buildAccountMarks(accounts: Account[]): Map<string, AccountMark> {
  const map = new Map<string, AccountMark>()
  for (const account of accounts) {
    if (account.itemId === FINANCEKIT_ITEM_ID) map.set(account.account_id, { kind: 'apple' })
    else if (account.institutionLogo) map.set(account.account_id, { kind: 'logo', logo: account.institutionLogo })
  }
  return map
}

const AccountMarksContext = createContext<Map<string, AccountMark> | null>(null)

/**
 * Owns the marks map, so the accounts stack is read once for the whole tree.
 *
 * This used to be a plain hook, and its comment claimed that calling it from several components
 * "costs nothing extra" because they share the accounts.list query cache. True of the network,
 * false of the render: each caller builds its own query observers, its own FinanceKit merge and its
 * own sort. That was affordable while a handful of components called it — but TransactionRow calls
 * it, so the real caller count is the ROW COUNT.
 *
 * Measured on a 696-row account sheet: one full merge+sort per row, a list still mounting rows
 * 6.4 seconds after the sheet opened, and each batch slower than the last. Mounting the work once
 * here is what makes a row cheap enough to render in a frame.
 */
export function AccountMarksProvider({ children }: { children: ReactNode }) {
  const accounts = useAccounts()
  const marks = useMemo(() => buildAccountMarks(accounts.data ?? []), [accounts.data])
  return <AccountMarksContext.Provider value={marks}>{children}</AccountMarksContext.Provider>
}

/**
 * Throwing on a missing provider rather than returning an empty map, for the same reason
 * useTransactionFeed throws: a silent empty map would drop every account chip on the surface that
 * forgot the provider, and a missing chip reads as "this account has no logo" rather than as a bug.
 */
export function useAccountMarks(): Map<string, AccountMark> {
  const marks = useContext(AccountMarksContext)
  if (!marks) throw new Error('useAccountMarks must be used inside an AccountMarksProvider.')
  return marks
}
