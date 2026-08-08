import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findById: vi.fn() }
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
    repoMock.findById.mockResolvedValue({ id: 'cat-1', name: 'Old', color: '#EAB308', icon: 'shopping', isDefault: false })
    repoMock.update.mockResolvedValue({ id: 'cat-1', name: 'Renamed', color: '#EAB308', icon: '🛍' })
    const { categoriesRouter } = await import('./categories.js')
    const caller = categoriesRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.update({ id: 'a5f2b3c0-1234-4a1b-8a1b-000000000001', name: 'Renamed' })

    expect(repoMock.update).toHaveBeenCalledWith('jwt-1', 'a5f2b3c0-1234-4a1b-8a1b-000000000001', { name: 'Renamed' })
  })

  const DEFAULT_ROW = { id: 'cat-1', name: 'Food & Drink', color: '#F97316', icon: 'food-and-drink', isDefault: true }
  const ID = 'a5f2b3c0-1234-4a1b-8a1b-000000000001'

  it('update rejects any edit to a default category', async () => {
    repoMock.findById.mockResolvedValue(DEFAULT_ROW)
    const { categoriesRouter } = await import('./categories.js')
    const caller = categoriesRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await expect(caller.update({ id: ID, name: 'Groceries' })).rejects.toThrow('Built-in categories cannot be edited.')
    await expect(caller.update({ id: ID, color: '#000000' })).rejects.toThrow('Built-in categories cannot be edited.')
    await expect(caller.update({ id: ID, icon: 'home' })).rejects.toThrow('Built-in categories cannot be edited.')
    expect(repoMock.update).not.toHaveBeenCalled()
  })

  it('delete rejects a default category', async () => {
    repoMock.findById.mockResolvedValue(DEFAULT_ROW)
    const { categoriesRouter } = await import('./categories.js')
    const caller = categoriesRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await expect(caller.delete({ id: ID })).rejects.toThrow('Built-in categories cannot be deleted.')
    expect(repoMock.delete).not.toHaveBeenCalled()
  })

  it('delete still removes a user-created category', async () => {
    repoMock.findById.mockResolvedValue({ ...DEFAULT_ROW, isDefault: false })
    repoMock.delete.mockResolvedValue(undefined)
    const { categoriesRouter } = await import('./categories.js')
    const caller = categoriesRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.delete({ id: ID })

    expect(repoMock.delete).toHaveBeenCalledWith('jwt-1', ID)
  })

  // A row the guard cannot find is left to the underlying write to report, so that a delete of an
  // already-deleted category still surfaces the repository's own error rather than a guard error.
  it('lets a missing category fall through to the repository', async () => {
    repoMock.findById.mockResolvedValue(null)
    repoMock.delete.mockResolvedValue(undefined)
    const { categoriesRouter } = await import('./categories.js')
    const caller = categoriesRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.delete({ id: ID })

    expect(repoMock.delete).toHaveBeenCalledWith('jwt-1', ID)
  })
})
