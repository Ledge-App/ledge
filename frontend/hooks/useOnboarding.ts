import { api } from '@/lib/api/client'

// Linking itself is not here: every Plaid Link session in the app goes through useLinkSession,
// which is what keeps create mode (spends a Plaid Item) and update mode (free) from being one
// code path someone can accidentally cross.
export function useOnboarding() {
  const seedCategories = api.onboarding.seedCategories.useMutation()
  const syncTransactions = api.transactions.sync.useMutation()
  const generateVendorMappings = api.onboarding.generateVendorMappings.useMutation()

  return {
    seedCategories: seedCategories.mutateAsync,
    // transactions.sync is a mutation: it advances a stateful per-item Plaid cursor,
    // so it must not be cached/refetched by query key. Onboarding drives it as a
    // one-off imperative step.
    syncTransactions: (cursors: Record<string, string>) => syncTransactions.mutateAsync({ cursors }),
    generateVendorMappings: generateVendorMappings.mutateAsync,
  }
}
