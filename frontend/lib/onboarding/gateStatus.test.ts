import { describe, expect, it } from 'vitest'
import { onboardingGateStatus, type OnboardingGateInput } from './gateStatus'

const ready: OnboardingGateInput = {
  credentialsLoading: false,
  hasCredentials: true,
  accountsLoading: false,
  accountCount: 3,
  itemErrorCount: 0,
  categoriesLoading: false,
  categoryCount: 12,
}

describe('onboardingGateStatus', () => {
  it('reports ready once credentials, accounts and categories are all present', () => {
    expect(onboardingGateStatus(ready)).toBe('ready')
  })

  it('holds on loading while any enabled step is still in flight', () => {
    expect(onboardingGateStatus({ ...ready, credentialsLoading: true })).toBe('loading')
    expect(onboardingGateStatus({ ...ready, accountsLoading: true })).toBe('loading')
    expect(onboardingGateStatus({ ...ready, categoriesLoading: true })).toBe('loading')
  })

  it('routes a user with no saved Plaid credentials to the BYOK form first', () => {
    expect(onboardingGateStatus({ ...ready, hasCredentials: false })).toBe('needs-credentials')
    // Even when later steps look unfinished, credentials come first.
    expect(
      onboardingGateStatus({ ...ready, hasCredentials: false, accountCount: 0, categoryCount: 0 }),
    ).toBe('needs-credentials')
  })

  it('routes a user with no accounts and no item errors to Plaid Link', () => {
    expect(onboardingGateStatus({ ...ready, accountCount: 0, itemErrorCount: 0 })).toBe('needs-link')
  })

  it('routes a linked user to category seeding when no categories exist yet', () => {
    expect(onboardingGateStatus({ ...ready, categoryCount: 0 })).toBe('needs-seeding')
  })

  it('does not demand a relink when every item failed to load', () => {
    // The regression: a broken item returns zero accounts alongside an itemError, and the
    // old gate read that as "never linked" and pushed the user back through Plaid Link.
    expect(onboardingGateStatus({ ...ready, accountCount: 0, itemErrorCount: 1 })).toBe('ready')
  })

  it('still seeds categories for a linked user whose only item is broken', () => {
    expect(
      onboardingGateStatus({ ...ready, accountCount: 0, itemErrorCount: 1, categoryCount: 0 }),
    ).toBe('needs-seeding')
  })

  it('treats a partial failure — some accounts, some broken items — as linked', () => {
    expect(onboardingGateStatus({ ...ready, accountCount: 2, itemErrorCount: 1 })).toBe('ready')
  })
})
