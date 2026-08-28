import { useCallback } from 'react'
import { api } from '@/lib/api/client'
import { syncDriver } from '@/lib/transactions/syncDriver'
import type { PlaidTransaction } from '@/types/domain'

// Linking itself is not here: every Plaid Link session in the app goes through useLinkSession,
// which is what keeps create mode (spends a Plaid Item) and update mode (free) from being one
// code path someone can accidentally cross.
export function useOnboarding() {
  const seedCategories = api.onboarding.seedCategories.useMutation()
  const generateVendorMappings = api.onboarding.generateVendorMappings.useMutation()
  const utils = api.useContext()

  /**
   * Goes through syncDriver rather than calling transactions.sync directly.
   *
   * The direct call it replaced advanced Plaid's cursor and then threw the response away
   * without persisting the transactions or the cursor, so the first tabs render re-downloaded
   * the same history from scratch. Draining through the driver leaves the cache and cursors
   * warm, and the cooldown then makes that first render free.
   *
   * Resolves once the first round has landed, which is what the returned `added` covers — the
   * sample the vendor-mapping generator needs. Any remaining backlog keeps draining behind the
   * screen transition.
   */
  const syncTransactions = useCallback(async (): Promise<{ added: PlaidTransaction[] }> => {
    // Fetched imperatively rather than read from useAccounts: the driver needs itemIds and the
    // account -> item map, and at this point in onboarding that query may not have run yet. An
    // empty item list would make the driver a no-op and seed no mappings at all.
    const { accounts } = await utils.accounts.list.fetch()
    const itemIds = Array.from(new Set(accounts.map((account) => account.itemId)))
    const accountIdToItemId = new Map(accounts.map((account) => [account.account_id, account.itemId]))

    const added: PlaidTransaction[] = []
    await syncDriver.syncNow({
      itemIds,
      accountIdToItemId,
      call: (input) => utils.client.transactions.sync.mutate(input),
      // Onboarding is an explicit user-driven setup step, never a remount.
      force: true,
      onRound: (response) => added.push(...response.added),
    })
    return { added }
  }, [utils])

  return {
    seedCategories: seedCategories.mutateAsync,
    syncTransactions,
    generateVendorMappings: generateVendorMappings.mutateAsync,
  }
}
