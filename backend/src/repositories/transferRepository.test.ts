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
      source: 'manual',
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
      source: 'manual',
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
      source: 'manual',
      expensePlaidTransactionId: 'plaid-tx-1',
      expenseManualTransactionId: null,
      incomePlaidTransactionId: 'plaid-tx-2',
      incomeManualTransactionId: null,
      amount: '500.00',
      note: null,
    })
  })

  it('always inserts with source manual — the sheet path can never mint auto rows', async () => {
    mockInsertReturning({
      id: 't3', kind: 'account_transfer', source: 'manual',
      expense_plaid_transaction_id: 'plaid-tx-1', expense_manual_transaction_id: null,
      income_plaid_transaction_id: 'plaid-tx-2', income_manual_transaction_id: null,
      amount: '500.00', note: null,
    })

    const { transferRepository } = await import('./transferRepository.js')
    await transferRepository.create('jwt-1', 'user-1', validInput)

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ source: 'manual' }))
  })
})

describe('transferRepository.createMany', () => {
  beforeEach(() => vi.clearAllMocks())

  function autoRow(id: string) {
    return {
      id,
      kind: 'credit_card_payment',
      source: 'auto',
      expense_plaid_transaction_id: `out-${id}`,
      expense_manual_transaction_id: null,
      income_plaid_transaction_id: `in-${id}`,
      income_manual_transaction_id: null,
      amount: '500.00',
      note: null,
    }
  }

  function insertReturning(result: { data?: unknown; error?: unknown }) {
    const single = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
    return { select: vi.fn(() => ({ single })) }
  }

  const draft = (n: number) => ({
    kind: 'credit_card_payment' as const,
    expensePlaidTransactionId: `out-t${n}`,
    incomePlaidTransactionId: `in-t${n}`,
    amount: '500.00',
  })

  it('inserts each row with source auto, null manual legs and no note', async () => {
    insertMock.mockReturnValue(insertReturning({ data: autoRow('t1') }))

    const { transferRepository } = await import('./transferRepository.js')
    const result = await transferRepository.createMany('jwt-1', 'user-1', [draft(1)])

    expect(insertMock).toHaveBeenCalledWith({
      user_id: 'user-1',
      kind: 'credit_card_payment',
      source: 'auto',
      expense_plaid_transaction_id: 'out-t1',
      expense_manual_transaction_id: null,
      income_plaid_transaction_id: 'in-t1',
      income_manual_transaction_id: null,
      amount: '500.00',
      note: null,
    })
    expect(result.created).toHaveLength(1)
    expect(result.created[0]).toMatchObject({ id: 't1', source: 'auto' })
    expect(result).toMatchObject({ skipped: 0, failed: 0 })
  })

  it('treats a unique violation as skipped success — the transfer already exists (multi-device race)', async () => {
    insertMock
      .mockReturnValueOnce(insertReturning({ error: { code: '23505', message: 'duplicate key' } }))
      .mockReturnValueOnce(insertReturning({ data: autoRow('t2') }))

    const { transferRepository } = await import('./transferRepository.js')
    const result = await transferRepository.createMany('jwt-1', 'user-1', [draft(1), draft(2)])

    expect(result.created.map((t) => t.id)).toEqual(['t2'])
    expect(result.skipped).toBe(1)
    expect(result.failed).toBe(0)
  })

  it('one row failing for another reason never fails the batch — auto-apply is best-effort', async () => {
    insertMock
      .mockReturnValueOnce(insertReturning({ error: { code: '57014', message: 'canceled' } }))
      .mockReturnValueOnce(insertReturning({ data: autoRow('t2') }))

    const { transferRepository } = await import('./transferRepository.js')
    const result = await transferRepository.createMany('jwt-1', 'user-1', [draft(1), draft(2)])

    expect(result.created.map((t) => t.id)).toEqual(['t2'])
    expect(result.skipped).toBe(0)
    expect(result.failed).toBe(1)
  })
})
