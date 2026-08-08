import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn() }
vi.mock('../repositories/transferDismissalRepository.js', () => ({ transferDismissalRepository: repoMock }))

describe('transferDismissals router', () => {
  beforeEach(() => vi.clearAllMocks())

  async function caller() {
    const { transferDismissalsRouter } = await import('./transferDismissals.js')
    return transferDismissalsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })
  }

  it('list passes the scoped jwt through', async () => {
    repoMock.list.mockResolvedValue([{ id: 'd1', expensePlaidTransactionId: 'plaid-tx-1' }])

    const result = await (await caller()).list()

    expect(repoMock.list).toHaveBeenCalledWith('jwt-1')
    expect(result).toEqual([{ id: 'd1', expensePlaidTransactionId: 'plaid-tx-1' }])
  })

  it('create passes the user id and expense leg through', async () => {
    repoMock.create.mockResolvedValue(undefined)

    await (await caller()).create({ expensePlaidTransactionId: 'plaid-tx-1' })

    expect(repoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', 'plaid-tx-1')
  })

  it('create rejects an empty transaction id', async () => {
    await expect((await caller()).create({ expensePlaidTransactionId: '' })).rejects.toThrow()
    expect(repoMock.create).not.toHaveBeenCalled()
  })
})
