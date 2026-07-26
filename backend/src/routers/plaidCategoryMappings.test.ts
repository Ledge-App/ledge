import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/plaidCategoryMappingRepository.js', () => ({ plaidCategoryMappingRepository: repoMock }))

describe('plaidCategoryMappings router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('create rejects assigning a PFC code that is already claimed by another category (unique constraint bubbles up as an error)', async () => {
    repoMock.create.mockRejectedValue(new Error('duplicate key value violates unique constraint'))
    const { plaidCategoryMappingsRouter } = await import('./plaidCategoryMappings.js')
    const caller = plaidCategoryMappingsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    await expect(
      caller.create({ plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: '11111111-1111-1111-1111-111111111111' }),
    ).rejects.toThrow()
  })

  it('list returns mappings scoped to the caller', async () => {
    repoMock.list.mockResolvedValue([
      { id: 'map-1', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: '11111111-1111-1111-1111-111111111111' },
    ])
    const { plaidCategoryMappingsRouter } = await import('./plaidCategoryMappings.js')
    const caller = plaidCategoryMappingsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    expect(await caller.list()).toHaveLength(1)
    expect(repoMock.list).toHaveBeenCalledWith('jwt-1')
  })
})
