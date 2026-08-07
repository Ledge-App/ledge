import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMock = { sync: vi.fn() }
vi.mock('../services/transactionSyncService.js', () => ({ transactionSyncService: serviceMock }))

describe('transactions router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sync passes the authenticated user id and cursor map through', async () => {
    serviceMock.sync.mockResolvedValue({ added: [], modified: [], removed: [], cursors: {}, hasMore: false })
    const { transactionsRouter } = await import('./transactions.js')
    const caller = transactionsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.sync({ cursors: { 'item-1': 'cursor-1' } })

    expect(serviceMock.sync).toHaveBeenCalledWith('user-1', { 'item-1': 'cursor-1' })
  })
})
