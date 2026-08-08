import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findById: vi.fn() }
vi.mock('../repositories/plaidCategoryMappingRepository.js', () => ({ plaidCategoryMappingRepository: repoMock }))

// The default-category guard reads through categoryRepository, so it has to be mocked here too —
// otherwise every mutation would reach a real Supabase client and reject for the wrong reason.
const categoryRepoMock = { findById: vi.fn() }
vi.mock('../repositories/categoryRepository.js', () => ({ categoryRepository: categoryRepoMock }))

const CATEGORY_ID = '11111111-1111-1111-1111-111111111111'
const MAPPING_ID = '22222222-2222-2222-2222-222222222222'
const CUSTOM = { id: CATEGORY_ID, name: 'Coffee', color: '#EAB308', icon: 'food-and-drink', isDefault: false }
const BUILT_IN = { ...CUSTOM, isDefault: true }

describe('plaidCategoryMappings router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('create rejects assigning a PFC code that is already claimed by another category (unique constraint bubbles up as an error)', async () => {
    categoryRepoMock.findById.mockResolvedValue(CUSTOM)
    repoMock.create.mockRejectedValue(new Error('duplicate key value violates unique constraint'))
    const { plaidCategoryMappingsRouter } = await import('./plaidCategoryMappings.js')
    const caller = plaidCategoryMappingsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await expect(
      caller.create({ plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: CATEGORY_ID }),
    ).rejects.toThrow('duplicate key value violates unique constraint')
  })

  it('list returns mappings scoped to the caller', async () => {
    repoMock.list.mockResolvedValue([
      { id: 'map-1', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: CATEGORY_ID },
    ])
    const { plaidCategoryMappingsRouter } = await import('./plaidCategoryMappings.js')
    const caller = plaidCategoryMappingsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    expect(await caller.list()).toHaveLength(1)
    expect(repoMock.list).toHaveBeenCalledWith('jwt-1')
  })

  it('create rejects routing a code onto a built-in category', async () => {
    categoryRepoMock.findById.mockResolvedValue(BUILT_IN)
    const { plaidCategoryMappingsRouter } = await import('./plaidCategoryMappings.js')
    const caller = plaidCategoryMappingsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await expect(
      caller.create({ plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: CATEGORY_ID }),
    ).rejects.toThrow('Built-in categories cannot be edited.')
    expect(repoMock.create).not.toHaveBeenCalled()
  })

  it('delete rejects stripping a code off a built-in category', async () => {
    repoMock.findById.mockResolvedValue({ id: MAPPING_ID, plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: CATEGORY_ID })
    categoryRepoMock.findById.mockResolvedValue(BUILT_IN)
    const { plaidCategoryMappingsRouter } = await import('./plaidCategoryMappings.js')
    const caller = plaidCategoryMappingsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await expect(caller.delete({ id: MAPPING_ID })).rejects.toThrow('Built-in categories cannot be edited.')
    expect(repoMock.delete).not.toHaveBeenCalled()
  })

  // findById is keyed on id rather than queued with mockResolvedValueOnce: the guard calls it twice
  // per update, and a queue that a rejecting test leaves half-consumed leaks into the next one.
  function categoriesById(rows: Record<string, typeof CUSTOM>) {
    categoryRepoMock.findById.mockImplementation(async (_jwt: string, id: string) => rows[id] ?? null)
  }

  const TARGET_ID = '33333333-3333-3333-3333-333333333333'

  function mappingOn(categoryId: string) {
    return { id: MAPPING_ID, plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId }
  }

  it('update rejects moving a code off a built-in category', async () => {
    repoMock.findById.mockResolvedValue(mappingOn(CATEGORY_ID))
    categoriesById({ [CATEGORY_ID]: BUILT_IN, [TARGET_ID]: { ...CUSTOM, id: TARGET_ID } })
    const { plaidCategoryMappingsRouter } = await import('./plaidCategoryMappings.js')
    const caller = plaidCategoryMappingsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await expect(caller.update({ id: MAPPING_ID, categoryId: TARGET_ID })).rejects.toThrow(
      'Built-in categories cannot be edited.',
    )
    expect(repoMock.update).not.toHaveBeenCalled()
  })

  it('update rejects moving a code onto a built-in category', async () => {
    repoMock.findById.mockResolvedValue(mappingOn(CATEGORY_ID))
    categoriesById({ [CATEGORY_ID]: CUSTOM, [TARGET_ID]: { ...BUILT_IN, id: TARGET_ID } })
    const { plaidCategoryMappingsRouter } = await import('./plaidCategoryMappings.js')
    const caller = plaidCategoryMappingsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await expect(caller.update({ id: MAPPING_ID, categoryId: TARGET_ID })).rejects.toThrow(
      'Built-in categories cannot be edited.',
    )
    expect(repoMock.update).not.toHaveBeenCalled()
  })

  it('update moves a code between two user-created categories', async () => {
    repoMock.findById.mockResolvedValue(mappingOn(CATEGORY_ID))
    categoriesById({ [CATEGORY_ID]: CUSTOM, [TARGET_ID]: { ...CUSTOM, id: TARGET_ID } })
    repoMock.update.mockResolvedValue(mappingOn(TARGET_ID))
    const { plaidCategoryMappingsRouter } = await import('./plaidCategoryMappings.js')
    const caller = plaidCategoryMappingsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.update({ id: MAPPING_ID, categoryId: TARGET_ID })

    expect(repoMock.update).toHaveBeenCalledWith('jwt-1', MAPPING_ID, TARGET_ID)
  })
})
