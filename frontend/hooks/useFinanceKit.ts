import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { financeKitDriver } from '@/lib/financekit/driver'
import type { FinanceKitSnapshot } from '@/lib/financekit/financeKitDriver'

/**
 * Reads the FinanceKit driver. Safe to call from as many components as useAccounts is called from
 * (eight, at last count) — the driver collapses concurrent runs and applies a cooldown, so mounting
 * this hook repeatedly costs nothing. That is the whole reason ownership sits outside React.
 */
export function useFinanceKit() {
  const snapshot = useSyncExternalStore(financeKitDriver.subscribe, financeKitDriver.getSnapshot)

  // requestIfNeeded is omitted on purpose: launching the app must never raise a Wallet permission
  // prompt. Only the explicit "Apple Card, Cash & Savings" row passes it.
  useEffect(() => {
    void financeKitDriver.syncNow()
  }, [])

  const sync = useCallback(
    (options: { requestIfNeeded?: boolean } = {}): Promise<FinanceKitSnapshot> =>
      financeKitDriver.syncNow({ ...options, force: true }),
    [],
  )

  return { snapshot, sync }
}
