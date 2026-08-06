import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/transferRepository.js', () => ({ transferRepository: repoMock }))

const baseInput = {
  kind: 'account_transfer' as const,
  expensePlaidTransactionId: 'plaid-tx-1',
  expenseManualTransactionId: null,
  incomePlaidTransactionId: 'plaid-tx-2',
  incomeManualTransactionId: null,
  amount: '500.00',
  note: null,
}

describe('transfers router', () => {
  beforeEach(() => vi.clearAllMocks())

  async function caller() {
    const { transfersRouter } = await import('./transfers.js')
    return transfersRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })
  }

  it('create passes the scoped jwt and user id through to the repository', async () => {
    repoMock.create.mockResolvedValue({ id: 't1', ...baseInput })

    await (await caller()).create(baseInput)

    expect(repoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', baseInput)
  })

  it('create accepts an unpaired transfer with no income leg', async () => {
    repoMock.create.mockResolvedValue({ id: 't1' })
    const input = { ...baseInput, incomePlaidTransactionId: null }

    await (await caller()).create(input)

    expect(repoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', input)
  })

  it('create rejects a kind that has no registered transfer type', async () => {
    await expect(
      // @ts-expect-error deliberately invalid kind
      (await caller()).create({ ...baseInput, kind: 'wire_transfer' }),
    ).rejects.toThrow()
    expect(repoMock.create).not.toHaveBeenCalled()
  })

  it('delete removes the transfer, which unmarks both legs at once', async () => {
    repoMock.delete.mockResolvedValue(undefined)
    const id = '33333333-3333-3333-3333-333333333333'

    await (await caller()).delete({ id })

    expect(repoMock.delete).toHaveBeenCalledWith('jwt-1', id)
  })
})
