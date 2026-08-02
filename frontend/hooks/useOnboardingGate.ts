import { api } from '@/lib/api/client'

export type OnboardingGateStatus =
  | 'loading'
  | 'needs-credentials'
  | 'needs-link'
  | 'needs-seeding'
  | 'ready'

// Derives onboarding progress from live backend state rather than a local flag, so
// the gate resumes at the correct step even if the app was killed mid-sequence
// (product.md: sign up → BYOK credentials → Plaid Link → category seeding).
export function useOnboardingGate(): OnboardingGateStatus {
  const credentials = api.plaidCredentials.get.useQuery()
  const hasCredentials = !!credentials.data

  const accounts = api.accounts.list.useQuery(undefined, { enabled: hasCredentials })
  const hasLinkedAccount = !!accounts.data && accounts.data.length > 0

  const categories = api.categories.list.useQuery(undefined, { enabled: hasLinkedAccount })
  const hasCategories = !!categories.data && categories.data.length > 0

  if (credentials.isLoading) return 'loading'
  if (!hasCredentials) return 'needs-credentials'

  if (accounts.isLoading) return 'loading'
  if (!hasLinkedAccount) return 'needs-link'

  if (categories.isLoading) return 'loading'
  if (!hasCategories) return 'needs-seeding'

  return 'ready'
}
