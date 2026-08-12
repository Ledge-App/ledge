import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), upsert: vi.fn(), bulkRecategorize: vi.fn() }
vi.mock('../repositories/vendorMappingRepository.js', () => ({ vendorMappingRepository: repoMock }))

// The ownership guard resolves the referenced category through categoryRepository, so it
// has to be mocked here too — otherwise mutations would reach a real Supabase client.
const categoryRepoMock = { findById: vi.fn() }
vi.mock('../repositories/categoryRepository.js', () => ({ categoryRepository: categoryRepoMock }))

describe('vendorMappings router', () => {
  beforeEach(() => vi.clearAllMocks())

  const categoryId = '11111111-1111-1111-1111-111111111111'

  it('upsert always writes source=user_defined, overriding any plaid_auto mapping', async () => {
    categoryRepoMock.findById.mockResolvedValue({ id: categoryId })
    repoMock.upsert.mockResolvedValue({ id: 'vm-1', vendorName: 'panda express', categoryId, subcategoryId: null, source: 'user_defined' })
    const { vendorMappingsRouter } = await import('./vendorMappings.js')
    const caller = vendorMappingsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.upsert({ vendorName: 'panda express', categoryId, subcategoryId: null })

    expect(repoMock.upsert).toHaveBeenCalledWith('jwt-1', 'user-1', {
      vendorName: 'panda express',
      categoryId,
      subcategoryId: null,
      source: 'user_defined',
    })
  })

  it('bulkRecategorize applies the mapping to every past transaction for that vendor', async () => {
    categoryRepoMock.findById.mockResolvedValue({ id: categoryId })
    repoMock.bulkRecategorize.mockResolvedValue({ updatedCount: 3 })
    const { vendorMappingsRouter } = await import('./vendorMappings.js')
    const caller = vendorMappingsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    const result = await caller.bulkRecategorize({
      vendorName: 'panda express',
      plaidTransactionIds: ['t1', 't2', 't3'],
      categoryId,
      subcategoryId: null,
    })

    expect(repoMock.bulkRecategorize).toHaveBeenCalledWith('jwt-1', 'user-1', {
      vendorName: 'panda express',
      plaidTransactionIds: ['t1', 't2', 't3'],
      categoryId,
      subcategoryId: null,
    })
    expect(result).toEqual({ updatedCount: 3 })
  })
})
