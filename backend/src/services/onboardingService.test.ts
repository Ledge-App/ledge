import { beforeEach, describe, expect, it, vi } from 'vitest'

const categoryRepoMock = { create: vi.fn() }
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
      icon: '🍽',
    })
    expect(pfcMappingRepoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', {
      plaidPfcPrimary: 'FOOD_AND_DRINK',
      plaidPfcDetailed: 'FOOD_AND_DRINK_RESTAURANTS',
      categoryId: 'cat-1',
    })
    expect(result.categoryIdsByLedgeName['Food & Drink']).toBe('cat-1')
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
