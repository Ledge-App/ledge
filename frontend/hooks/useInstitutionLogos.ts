import { useMemo } from 'react'
import { useAccounts } from './useAccounts'

/**
 * accountId -> institution logo (base64 PNG) for badge rendering on transaction rows.
 * Rides the shared accounts.list query cache — calling this in several components costs
 * nothing extra. Accounts whose institution has no logo are simply absent from the map.
 */
export function useInstitutionLogos(): Map<string, string> {
  const accounts = useAccounts()
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const account of accounts.data ?? []) {
      if (account.institutionLogo) map.set(account.account_id, account.institutionLogo)
    }
    return map
  }, [accounts.data])
}
