import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertMock = vi.fn()
const supabaseClientMock = { from: vi.fn(() => ({ insert: insertMock })) }
vi.mock('../lib/supabase/scopedClient.js', () => ({ getScopedClient: vi.fn(() => supabaseClientMock) }))

describe('reimbursementRepository.create', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects when both a Plaid and a manual id are given for the expense side', async () => {
    const { reimbursementRepository } = await import('./reimbursementRepository.js')

    await expect(
      reimbursementRepository.create('jwt-1', 'user-1', {
        expensePlaidTransactionId: 'plaid-tx-1',
        expenseManualTransactionId: 'manual-1',
        incomePlaidTransactionId: 'plaid-tx-2',
        incomeManualTransactionId: null,
        amount: '30.00',
        note: null,
      }),
    ).rejects.toThrow(/exactly one/i)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects when neither side has an id', async () => {
    const { reimbursementRepository } = await import('./reimbursementRepository.js')

    await expect(
      reimbursementRepository.create('jwt-1', 'user-1', {
        expensePlaidTransactionId: null,
        expenseManualTransactionId: null,
        incomePlaidTransactionId: 'plaid-tx-2',
        incomeManualTransactionId: null,
        amount: '30.00',
        note: null,
      }),
    ).rejects.toThrow(/exactly one/i)
  })

  it('accepts a valid Plaid-expense / manual-income pairing (cash reimbursement)', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'r1', expense_plaid_transaction_id: 'plaid-tx-1', expense_manual_transaction_id: null, income_plaid_transaction_id: null, income_manual_transaction_id: 'manual-2', amount: '30.00', note: null },
      error: null,
    })
    const select = vi.fn(() => ({ single }))
    insertMock.mockReturnValue({ select })

    const { reimbursementRepository } = await import('./reimbursementRepository.js')
    const result = await reimbursementRepository.create('jwt-1', 'user-1', {
      expensePlaidTransactionId: 'plaid-tx-1',
      expenseManualTransactionId: null,
      incomePlaidTransactionId: null,
      incomeManualTransactionId: 'manual-2',
      amount: '30.00',
      note: null,
    })

    expect(result.id).toBe('r1')
  })
})
