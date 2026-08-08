import { describe, expect, it } from 'vitest'
import { ONBOARDING_ROUTES, onboardingBackTarget } from './backTarget'

describe('onboardingBackTarget', () => {
  it('offers no back on the first step, which has nowhere to go but out', () => {
    expect(onboardingBackTarget(1)).toBeNull()
    expect(onboardingBackTarget(1, { seedingFailed: true })).toBeNull()
  })

  it('sends step 2 back to the credentials form, so Plaid keys can be corrected', () => {
    expect(onboardingBackTarget(2)).toBe(ONBOARDING_ROUTES[1])
  })

  it('hides back while seeding is still running, so the sequence is not stranded', () => {
    expect(onboardingBackTarget(3)).toBeNull()
    expect(onboardingBackTarget(3, { seedingFailed: false })).toBeNull()
  })

  it('offers back once seeding has failed, alongside Try Again', () => {
    expect(onboardingBackTarget(3, { seedingFailed: true })).toBe(ONBOARDING_ROUTES[2])
  })
})
