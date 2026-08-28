import { beforeEach, describe, expect, it, vi } from 'vitest'

const onboardingServiceMock = {
  seedCategories: vi.fn(),
  generateVendorMappings: vi.fn(),
}
vi.mock('../services/onboardingService.js', () => ({ onboardingService: onboardingServiceMock }))

describe('onboarding router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('seedCategories delegates to onboardingService with caller jwt/userId', async () => {
    onboardingServiceMock.seedCategories.mockResolvedValue({ categoryIdsByTofiName: { 'Food & Drink': 'cat-1' } })
    const { onboardingRouter } = await import('./onboarding.js')
    const caller = onboardingRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    const result = await caller.seedCategories()

    expect(onboardingServiceMock.seedCategories).toHaveBeenCalledWith('jwt-1', 'user-1')
    expect(result).toEqual({ categoryIdsByTofiName: { 'Food & Drink': 'cat-1' } })
  })

  it('generateVendorMappings delegates to onboardingService with input transactions', async () => {
    onboardingServiceMock.generateVendorMappings.mockResolvedValue({ createdCount: 1 })
    const { onboardingRouter } = await import('./onboarding.js')
    const caller = onboardingRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    const transactions = [
      { merchant_name: 'Blue Bottle', personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' } },
    ]
    const result = await caller.generateVendorMappings({ transactions })

    expect(onboardingServiceMock.generateVendorMappings).toHaveBeenCalledWith('jwt-1', 'user-1', transactions)
    expect(result).toEqual({ createdCount: 1 })
  })
})
