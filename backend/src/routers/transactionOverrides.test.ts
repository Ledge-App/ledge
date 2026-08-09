import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), upsert: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/transactionOverrideRepository.js', () => ({ transactionOverrideRepository: repoMock }))

describe('transactionOverrides router', () => {
  beforeEach(() => vi.clearAllMocks())

  const categoryId = '11111111-1111-1111-1111-111111111111'

  it('upsert writes a per-transaction override keyed by the opaque Plaid transaction id', async () => {
    repoMock.upsert.mockResolvedValue({ id: 'to-1', plaidTransactionId: 'plaid-tx-1', categoryId, subcategoryId: null, note: null })
    const { transactionOverridesRouter } = await import('./transactionOverrides.js')
    const caller = transactionOverridesRouter.createCaller({ userId: 'user-1', email: null, jwt: 'jwt-1' })

    await caller.upsert({ plaidTransactionId: 'plaid-tx-1', categoryId, subcategoryId: null, note: null })

    expect(repoMock.upsert).toHaveBeenCalledWith('jwt-1', 'user-1', {
      plaidTransactionId: 'plaid-tx-1',
      categoryId,
      subcategoryId: null,
      note: null,
    })
  })
})
