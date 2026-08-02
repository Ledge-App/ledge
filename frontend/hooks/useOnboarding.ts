import { api } from '@/lib/api/client'

export function useOnboarding() {
  const createLinkToken = api.plaidLink.createLinkToken.useMutation()
  const exchangeToken = api.plaidLink.exchangeToken.useMutation()
  const seedCategories = api.onboarding.seedCategories.useMutation()
  const syncTransactions = api.transactions.sync.useMutation()
  const generateVendorMappings = api.onboarding.generateVendorMappings.useMutation()

  return {
    createLinkToken: createLinkToken.mutateAsync,
    exchangeToken: exchangeToken.mutateAsync,
    seedCategories: seedCategories.mutateAsync,
    // transactions.sync is a mutation: it advances a stateful per-item Plaid cursor,
    // so it must not be cached/refetched by query key. Onboarding drives it as a
    // one-off imperative step.
    syncTransactions: (cursors: Record<string, string>) => syncTransactions.mutateAsync({ cursors }),
    generateVendorMappings: generateVendorMappings.mutateAsync,
  }
}
