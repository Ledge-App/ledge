import { beforeEach, describe, expect, it, vi } from 'vitest'

const singleMock = vi.fn()
const supabaseClientMock = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: singleMock,
    order: vi.fn().mockResolvedValue({ data: [{ id: 'cat-1', name: 'Food & Drink', color: '#F97316', icon: '🍽' }], error: null }),
  })),
}
vi.mock('../lib/supabase/scopedClient.js', () => ({ getScopedClient: vi.fn(() => supabaseClientMock) }))

describe('categoryRepository', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists categories for the caller via a scoped client', async () => {
    const { categoryRepository } = await import('./categoryRepository.js')
    const result = await categoryRepository.list('jwt-1')

    expect(result).toEqual([{ id: 'cat-1', name: 'Food & Drink', color: '#F97316', icon: '🍽' }])
  })

  it('creates a category scoped to the caller\'s user id', async () => {
    singleMock.mockResolvedValue({ data: { id: 'cat-2', name: 'Shopping', color: '#EAB308', icon: '🛍' }, error: null })
    const { categoryRepository } = await import('./categoryRepository.js')

    const result = await categoryRepository.create('jwt-1', 'user-1', { name: 'Shopping', color: '#EAB308', icon: '🛍' })

    expect(result).toEqual({ id: 'cat-2', name: 'Shopping', color: '#EAB308', icon: '🛍' })
  })
})
