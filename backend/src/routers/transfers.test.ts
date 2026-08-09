import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), createMany: vi.fn(), delete: vi.fn() }
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
    return transfersRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })
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

  // A transfer referencing nothing is an invisible orphan: nothing can find it, undo it or
  // exclude anything through it. The client bug that motivated this check nulled all four
  // columns for an investment leg whose source wasn't mapped to any column.
  it('create rejects a transfer with no leg at all', async () => {
    await expect(
      (await caller()).create({
        ...baseInput,
        expensePlaidTransactionId: null,
        expenseManualTransactionId: null,
        incomePlaidTransactionId: null,
        incomeManualTransactionId: null,
      }),
    ).rejects.toThrow()
    expect(repoMock.create).not.toHaveBeenCalled()
  })

  it('create still accepts a one-legged transfer from the income side', async () => {
    // One leg is legitimate — it's how an item whose counterpart isn't in the feed gets excluded.
    repoMock.create.mockResolvedValue({ id: 't1' })
    const input = { ...baseInput, expensePlaidTransactionId: null }

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

  describe('createMany (auto-apply)', () => {
    const autoDraft = {
      kind: 'credit_card_payment' as const,
      expensePlaidTransactionId: 'plaid-out-1',
      incomePlaidTransactionId: 'plaid-in-1',
      amount: '500.00',
    }

    it('passes drafts through to the repository', async () => {
      repoMock.createMany.mockResolvedValue({ created: [], skipped: 0, failed: 0 })

      await (await caller()).createMany({ transfers: [autoDraft] })

      expect(repoMock.createMany).toHaveBeenCalledWith('jwt-1', 'user-1', [autoDraft])
    })

    it('rejects kinds auto-detection must never create', async () => {
      await expect(
        // @ts-expect-error deliberately invalid kind — reimbursements stay manual-only
        (await caller()).createMany({ transfers: [{ ...autoDraft, kind: 'reimbursement' }] }),
      ).rejects.toThrow()
      expect(repoMock.createMany).not.toHaveBeenCalled()
    })

    it('rejects unpaired drafts: auto transfers always have both legs', async () => {
      await expect(
        // @ts-expect-error deliberately missing income leg
        (await caller()).createMany({ transfers: [{ kind: 'credit_card_payment', expensePlaidTransactionId: 'x', amount: '1.00' }] }),
      ).rejects.toThrow()
      expect(repoMock.createMany).not.toHaveBeenCalled()
    })

    it('rejects an empty batch and one beyond the 100-row bound', async () => {
      await expect((await caller()).createMany({ transfers: [] })).rejects.toThrow()
      await expect(
        (await caller()).createMany({ transfers: Array.from({ length: 101 }, () => autoDraft) }),
      ).rejects.toThrow()
      expect(repoMock.createMany).not.toHaveBeenCalled()
    })
  })
})
