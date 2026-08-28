import { beforeEach, describe, expect, it, vi } from 'vitest'

const categoryRepoMock = { create: vi.fn(), list: vi.fn() }
const subcategoryRepoMock = { create: vi.fn() }
const pfcMappingRepoMock = { create: vi.fn(), list: vi.fn() }
const vendorMappingRepoMock = { upsert: vi.fn() }

vi.mock('../repositories/categoryRepository.js', () => ({ categoryRepository: categoryRepoMock }))
vi.mock('../repositories/subcategoryRepository.js', () => ({ subcategoryRepository: subcategoryRepoMock }))
vi.mock('../repositories/plaidCategoryMappingRepository.js', () => ({ plaidCategoryMappingRepository: pfcMappingRepoMock }))
vi.mock('../repositories/vendorMappingRepository.js', () => ({ vendorMappingRepository: vendorMappingRepoMock }))

describe('onboardingService.seedCategories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates one category per DEFAULT_PFC_MAPPING entry, plus its subcategories and PFC mappings', async () => {
    categoryRepoMock.list.mockResolvedValue([])
    let categoryCounter = 0
    categoryRepoMock.create.mockImplementation(async (_jwt: string, _userId: string, input: { name: string }) => ({
      id: `cat-${++categoryCounter}`,
      ...input,
    }))
    subcategoryRepoMock.create.mockResolvedValue({ id: 'sub-1', categoryId: 'cat-1', name: 'Restaurants' })
    pfcMappingRepoMock.create.mockResolvedValue({})

    const { onboardingService } = await import('./onboardingService.js')
    const result = await onboardingService.seedCategories('jwt-1', 'user-1')

    expect(categoryRepoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', {
      name: 'Food & Drink',
      color: '#F97316',
      icon: 'food-and-drink',
      isDefault: true,
    })
    expect(pfcMappingRepoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', {
      plaidPfcPrimary: 'FOOD_AND_DRINK',
      plaidPfcDetailed: 'FOOD_AND_DRINK_RESTAURANTS',
      categoryId: 'cat-1',
    })
    expect(result.categoryIdsByTofiName['Food & Drink']).toBe('cat-1')
  })

  // Seeding is re-entered whenever the onboarding gate sees no categories for the user, so
  // this early return is the only thing standing between a re-run and a duplicate set.
  it('creates nothing and maps the existing rows when the user already has categories', async () => {
    categoryRepoMock.list.mockResolvedValue([
      { id: 'cat-existing-1', name: 'Food & Drink', color: '#F97316', icon: '🍽' },
      { id: 'cat-existing-2', name: 'Transport', color: '#0EA5E9', icon: '🚗' },
    ])

    const { onboardingService } = await import('./onboardingService.js')
    const result = await onboardingService.seedCategories('jwt-1', 'user-1')

    expect(categoryRepoMock.create).not.toHaveBeenCalled()
    expect(subcategoryRepoMock.create).not.toHaveBeenCalled()
    expect(pfcMappingRepoMock.create).not.toHaveBeenCalled()
    expect(result.categoryIdsByTofiName).toEqual({
      'Food & Drink': 'cat-existing-1',
      Transport: 'cat-existing-2',
    })
  })
})

describe('onboardingService.generateVendorMappings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes one plaid_auto vendor mapping per unique merchant, first match wins', async () => {
    pfcMappingRepoMock.list.mockResolvedValue([
      { id: 'm1', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: 'cat-coffee' },
    ])
    vendorMappingRepoMock.upsert.mockResolvedValue({})

    const { onboardingService } = await import('./onboardingService.js')
    const result = await onboardingService.generateVendorMappings('jwt-1', 'user-1', [
      { merchant_name: 'Blue Bottle', personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' } },
      { merchant_name: 'Blue Bottle', personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' } },
    ])

    expect(vendorMappingRepoMock.upsert).toHaveBeenCalledTimes(1)
    expect(vendorMappingRepoMock.upsert).toHaveBeenCalledWith('jwt-1', 'user-1', {
      vendorName: 'Blue Bottle',
      categoryId: 'cat-coffee',
      subcategoryId: null,
      source: 'plaid_auto',
    })
    expect(result).toEqual({ createdCount: 1 })
  })
})
