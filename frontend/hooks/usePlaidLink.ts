import { api } from '@/lib/api/client'

// Generic Plaid Link token creation/exchange, usable outside the onboarding flow
// (see hooks/useOnboarding.ts for the onboarding-specific bundle this overlaps with).
export function usePlaidLink() {
  const createLinkToken = api.plaidLink.createLinkToken.useMutation()
  const exchangeToken = api.plaidLink.exchangeToken.useMutation()

  return {
    createLinkToken: createLinkToken.mutateAsync,
    exchangeToken: exchangeToken.mutateAsync,
  }
}
