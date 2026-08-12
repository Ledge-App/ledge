import { beforeEach, describe, expect, it, vi } from 'vitest'

const categoryRepoMock = { findById: vi.fn() }
vi.mock('../../repositories/categoryRepository.js', () => ({ categoryRepository: categoryRepoMock }))

const subcategoryRepoMock = { findById: vi.fn() }
vi.mock('../../repositories/subcategoryRepository.js', () => ({ subcategoryRepository: subcategoryRepoMock }))

const manualTransactionRepoMock = { findById: vi.fn() }
vi.mock('../../repositories/manualTransactionRepository.js', () => ({ manualTransactionRepository: manualTransactionRepoMock }))

const CATEGORY_ID = '11111111-1111-1111-1111-111111111111'
const SUBCATEGORY_ID = '22222222-2222-2222-2222-222222222222'
const MANUAL_TX_ID = '33333333-3333-3333-3333-333333333333'

describe('assertOwnedRefs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes when every referenced row is visible through the caller scope', async () => {
    categoryRepoMock.findById.mockResolvedValue({ id: CATEGORY_ID })
    subcategoryRepoMock.findById.mockResolvedValue({ id: SUBCATEGORY_ID })
    manualTransactionRepoMock.findById.mockResolvedValue({ id: MANUAL_TX_ID })
    const { assertOwnedRefs } = await import('./assertOwnedRefs.js')

    await expect(
      assertOwnedRefs('jwt-1', {
        categoryId: CATEGORY_ID,
        subcategoryId: SUBCATEGORY_ID,
        manualTransactionIds: [MANUAL_TX_ID, null],
      }),
    ).resolves.toBeUndefined()

    expect(categoryRepoMock.findById).toHaveBeenCalledWith('jwt-1', CATEGORY_ID)
    expect(subcategoryRepoMock.findById).toHaveBeenCalledWith('jwt-1', SUBCATEGORY_ID)
    expect(manualTransactionRepoMock.findById).toHaveBeenCalledWith('jwt-1', MANUAL_TX_ID)
  })

  it("rejects a category the caller's RLS scope cannot see (another user's or nonexistent)", async () => {
    categoryRepoMock.findById.mockResolvedValue(null)
    const { assertOwnedRefs } = await import('./assertOwnedRefs.js')

    await expect(assertOwnedRefs('jwt-1', { categoryId: CATEGORY_ID })).rejects.toThrow('Category not found.')
  })

  it('rejects an invisible subcategory', async () => {
    subcategoryRepoMock.findById.mockResolvedValue(null)
    const { assertOwnedRefs } = await import('./assertOwnedRefs.js')

    await expect(assertOwnedRefs('jwt-1', { subcategoryId: SUBCATEGORY_ID })).rejects.toThrow('Subcategory not found.')
  })

  it('rejects an invisible manual transaction leg', async () => {
    manualTransactionRepoMock.findById.mockResolvedValue(null)
    const { assertOwnedRefs } = await import('./assertOwnedRefs.js')

    await expect(assertOwnedRefs('jwt-1', { manualTransactionIds: [MANUAL_TX_ID] })).rejects.toThrow(
      'Transaction not found.',
    )
  })

  it('skips null and undefined refs without touching any repository', async () => {
    const { assertOwnedRefs } = await import('./assertOwnedRefs.js')

    await expect(
      assertOwnedRefs('jwt-1', { categoryId: null, subcategoryId: undefined, manualTransactionIds: [null, undefined] }),
    ).resolves.toBeUndefined()

    expect(categoryRepoMock.findById).not.toHaveBeenCalled()
    expect(subcategoryRepoMock.findById).not.toHaveBeenCalled()
    expect(manualTransactionRepoMock.findById).not.toHaveBeenCalled()
  })
})
