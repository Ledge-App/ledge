import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/manualTransactionRepository.js', () => ({ manualTransactionRepository: repoMock }))

const categoryId = '11111111-1111-1111-1111-111111111111'

describe('manualTransactions router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('create defaults amount to a positive value regardless of type', async () => {
    repoMock.create.mockResolvedValue({ id: 'mt-1', amount: '5.00', type: 'expense', categoryId, subcategoryId: null, date: '2026-06-21', note: 'Street food' })
    const { manualTransactionsRouter } = await import('./manualTransactions.js')
    const caller = manualTransactionsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.create({ amount: '5.00', type: 'expense', categoryId, subcategoryId: null, date: '2026-06-21', note: 'Street food' })

    expect(repoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', {
      amount: '5.00',
      type: 'expense',
      categoryId,
      subcategoryId: null,
      date: '2026-06-21',
      note: 'Street food',
    })
  })

  it('rejects a negative amount at the input-validation layer', async () => {
    const { manualTransactionsRouter } = await import('./manualTransactions.js')
    const caller = manualTransactionsRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await expect(
      caller.create({ amount: '-5.00', type: 'expense', categoryId, subcategoryId: null, date: '2026-06-21', note: null }),
    ).rejects.toThrow()
  })
})
