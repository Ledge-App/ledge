import { api } from '@/lib/api/client'
import { onboardingGateStatus, type OnboardingGateStatus } from '@/lib/onboarding/gateStatus'

export type { OnboardingGateStatus }

// Derives onboarding progress from live backend state rather than a local flag, so
// the gate resumes at the correct step even if the app was killed mid-sequence
// (product.md: sign up → BYOK credentials → Plaid Link → category seeding).
export function useOnboardingGate(): OnboardingGateStatus {
  const credentials = api.plaidCredentials.get.useQuery()
  const hasCredentials = !!credentials.data

  const accounts = api.accounts.list.useQuery(undefined, { enabled: hasCredentials })
  const accountCount = accounts.data?.accounts.length ?? 0
  const itemErrorCount = accounts.data?.itemErrors.length ?? 0

  // An item that fails to load still proves the user linked a bank — see gateStatus.
  const hasLinkedAccount = accountCount > 0 || itemErrorCount > 0

  const categories = api.categories.list.useQuery(undefined, { enabled: hasLinkedAccount })

  return onboardingGateStatus({
    credentialsLoading: credentials.isLoading,
    hasCredentials,
    accountsLoading: accounts.isLoading,
    accountCount,
    itemErrorCount,
    categoriesLoading: categories.isLoading,
    categoryCount: categories.data?.length ?? 0,
  })
}
