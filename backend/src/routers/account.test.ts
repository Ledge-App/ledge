import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMock = { deleteAccount: vi.fn() }
vi.mock('../services/accountDeletionService.js', () => ({ accountDeletionService: serviceMock }))

describe('account router', () => {
  beforeEach(() => vi.clearAllMocks())

  async function caller(userId: string | null) {
    const { accountRouter } = await import('./account.js')
    return accountRouter.createCaller(
      userId === null
        ? { userId: null, email: null, jwt: null }
        : { userId, email: null, jwt: 'jwt-1' },
    )
  }

  it('delete removes the caller’s own account', async () => {
    serviceMock.deleteAccount.mockResolvedValue({ deleted: true })

    await expect((await caller('user-1')).delete()).resolves.toEqual({ deleted: true })

    expect(serviceMock.deleteAccount).toHaveBeenCalledWith('user-1')
  })

  it('delete rejects an unauthenticated caller', async () => {
    await expect((await caller(null)).delete()).rejects.toThrow()
    expect(serviceMock.deleteAccount).not.toHaveBeenCalled()
  })
})
