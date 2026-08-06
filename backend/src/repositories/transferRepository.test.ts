import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertMock = vi.fn()
const supabaseClientMock = { from: vi.fn(() => ({ insert: insertMock })) }
vi.mock('../lib/supabase/scopedClient.js', () => ({ getScopedClient: vi.fn(() => supabaseClientMock) }))

const validInput = {
  kind: 'account_transfer' as const,
  expensePlaidTransactionId: 'plaid-tx-1',
  expenseManualTransactionId: null,
  incomePlaidTransactionId: 'plaid-tx-2',
  incomeManualTransactionId: null,
  amount: '500.00',
  note: null,
}

function mockInsertReturning(row: Record<string, unknown>) {
  const single = vi.fn().mockResolvedValue({ data: row, error: null })
  insertMock.mockReturnValue({ select: vi.fn(() => ({ single })) })
}

describe('transferRepository.create', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects when both a Plaid and a manual id are given for the expense side', async () => {
    const { transferRepository } = await import('./transferRepository.js')

    await expect(
      transferRepository.create('jwt-1', 'user-1', {
        ...validInput,
        expenseManualTransactionId: '11111111-1111-1111-1111-111111111111',
      }),
    ).rejects.toThrow(/exactly one/i)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects when the expense side has no id', async () => {
    const { transferRepository } = await import('./transferRepository.js')

    await expect(
      transferRepository.create('jwt-1', 'user-1', { ...validInput, expensePlaidTransactionId: null }),
    ).rejects.toThrow(/exactly one/i)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects when both a Plaid and a manual id are given for the income side', async () => {
    const { transferRepository } = await import('./transferRepository.js')

    await expect(
      transferRepository.create('jwt-1', 'user-1', {
        ...validInput,
        incomeManualTransactionId: '22222222-2222-2222-2222-222222222222',
      }),
    ).rejects.toThrow(/at most one/i)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('accepts an unpaired transfer — the destination account may not be connected', async () => {
    mockInsertReturning({
      id: 't1',
      kind: 'account_transfer',
      expense_plaid_transaction_id: 'plaid-tx-1',
      expense_manual_transaction_id: null,
      income_plaid_transaction_id: null,
      income_manual_transaction_id: null,
      amount: '500.00',
      note: null,
    })

    const { transferRepository } = await import('./transferRepository.js')
    const result = await transferRepository.create('jwt-1', 'user-1', {
      ...validInput,
      incomePlaidTransactionId: null,
    })

    expect(result.id).toBe('t1')
    expect(result.incomePlaidTransactionId).toBeNull()
    expect(result.incomeManualTransactionId).toBeNull()
  })

  it('accepts a paired transfer and maps the row to camelCase', async () => {
    mockInsertReturning({
      id: 't2',
      kind: 'credit_card_payment',
      expense_plaid_transaction_id: 'plaid-tx-1',
      expense_manual_transaction_id: null,
      income_plaid_transaction_id: 'plaid-tx-2',
      income_manual_transaction_id: null,
      amount: '500.00',
      note: null,
    })

    const { transferRepository } = await import('./transferRepository.js')
    const result = await transferRepository.create('jwt-1', 'user-1', { ...validInput, kind: 'credit_card_payment' })

    expect(result).toEqual({
      id: 't2',
      kind: 'credit_card_payment',
      expensePlaidTransactionId: 'plaid-tx-1',
      expenseManualTransactionId: null,
      incomePlaidTransactionId: 'plaid-tx-2',
      incomeManualTransactionId: null,
      amount: '500.00',
      note: null,
    })
  })
})
