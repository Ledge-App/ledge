export type OnboardingGateStatus =
  | 'loading'
  | 'needs-credentials'
  | 'needs-link'
  | 'needs-seeding'
  | 'ready'

export interface OnboardingGateInput {
  credentialsLoading: boolean
  hasCredentials: boolean
  accountsLoading: boolean
  accountCount: number
  itemErrorCount: number
  categoriesLoading: boolean
  categoryCount: number
}

/**
 * Maps the three onboarding queries onto the step the user belongs on.
 *
 * Split out of `useOnboardingGate` because the interesting decision here is not the data
 * fetching — it is what "zero accounts" means, which has two very different causes.
 */
export function onboardingGateStatus(input: OnboardingGateInput): OnboardingGateStatus {
  if (input.credentialsLoading) return 'loading'
  if (!input.hasCredentials) return 'needs-credentials'

  if (input.accountsLoading) return 'loading'

  // `accounts.list` isolates per-item Plaid failures instead of throwing, so an item in
  // ITEM_LOGIN_REQUIRED (or with revoked access) yields zero accounts *and* an itemError.
  // That is a linked user with a broken item, not a new user — reading it as `needs-link`
  // sends someone who already linked their bank back through Plaid Link on every cold
  // start. Let them through: the accounts tab already renders itemErrors per institution
  // and suppresses its own empty state for exactly this case.
  const hasLinkedAccount = input.accountCount > 0 || input.itemErrorCount > 0
  if (!hasLinkedAccount) return 'needs-link'

  if (input.categoriesLoading) return 'loading'
  if (input.categoryCount === 0) return 'needs-seeding'

  return 'ready'
}
