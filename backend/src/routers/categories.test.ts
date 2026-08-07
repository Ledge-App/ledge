import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/categoryRepository.js', () => ({ categoryRepository: repoMock }))

describe('categories router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('list scopes the query via the caller\'s JWT', async () => {
    repoMock.list.mockResolvedValue([])
    const { categoriesRouter } = await import('./categories.js')
    const caller = categoriesRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.list()

    expect(repoMock.list).toHaveBeenCalledWith('jwt-1')
  })

  it('create passes the caller\'s user id and JWT to the repository', async () => {
    repoMock.create.mockResolvedValue({ id: 'cat-1', name: 'Shopping', color: '#EAB308', icon: '🛍' })
    const { categoriesRouter } = await import('./categories.js')
    const caller = categoriesRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.create({ name: 'Shopping', color: '#EAB308', icon: '🛍' })

    expect(repoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', { name: 'Shopping', color: '#EAB308', icon: '🛍' })
  })

  it('update strips id from the patch forwarded to the repository', async () => {
    repoMock.update.mockResolvedValue({ id: 'cat-1', name: 'Renamed', color: '#EAB308', icon: '🛍' })
    const { categoriesRouter } = await import('./categories.js')
    const caller = categoriesRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.update({ id: 'a5f2b3c0-1234-4a1b-8a1b-000000000001', name: 'Renamed' })

    expect(repoMock.update).toHaveBeenCalledWith('jwt-1', 'a5f2b3c0-1234-4a1b-8a1b-000000000001', { name: 'Renamed' })
  })
})
