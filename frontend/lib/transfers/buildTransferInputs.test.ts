import { describe, expect, it } from 'vitest'
import { buildTransferInputs } from './buildTransferInputs'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

function item(overrides: Partial<FeedItem> & Pick<FeedItem, 'id' | 'amount' | 'date'>): FeedItem {
  return {
    source: 'plaid',
    merchantName: 'Test',
    categoryId: null,
    subcategoryId: null,
    categorySource: 'uncategorized',
    confidenceLevel: null,
    pfcDetailed: null,
    accountId: 'checking',
    pending: false,
    note: null,
    reimbursedAmount: null,
    netAmount: null,
    isReimbursementIncome: false,
    reimbursementCategoryId: null,
    transferId: null,
    transferKind: null,
    transferRole: null,
    transferSource: null,
    isBrokerageCashAccount: false,
    isSweptOutflow: false,
    ...overrides,
  }
}

const expense = item({ id: 'e1', amount: 500, date: '2026-08-10' })
const income = item({ id: 'i1', amount: -500, date: '2026-08-11', accountId: 'savings' })
const feed = [expense, income]

describe('buildTransferInputs', () => {
  it('puts the positive-amount item on the expense leg and the counterpart on the income leg', () => {
    expect(buildTransferInputs(expense, { kind: 'account_transfer', counterpartIds: ['i1'] }, feed)).toEqual([
      {
        kind: 'account_transfer',
        expensePlaidTransactionId: 'e1',
        expenseManualTransactionId: null,
        incomePlaidTransactionId: 'i1',
        incomeManualTransactionId: null,
        amount: '500.00',
        note: null,
      },
    ])
  })

  it('keeps the legs straight when the marked item is the income side', () => {
    const [input] = buildTransferInputs(income, { kind: 'account_transfer', counterpartIds: ['e1'] }, feed)
    expect(input.expensePlaidTransactionId).toBe('e1')
    expect(input.incomePlaidTransactionId).toBe('i1')
  })

  it('routes manual transactions to the manual id fields', () => {
    const manual = item({ id: 'm1', amount: 40, date: '2026-08-10', source: 'manual' })
    const [input] = buildTransferInputs(manual, { kind: 'account_transfer', counterpartIds: [] }, [manual])
    expect(input.expenseManualTransactionId).toBe('m1')
    expect(input.expensePlaidTransactionId).toBeNull()
  })

  it('creates a one-legged transfer when no counterpart was picked', () => {
    const inputs = buildTransferInputs(expense, { kind: 'account_transfer', counterpartIds: [] }, feed)
    expect(inputs).toHaveLength(1)
    expect(inputs[0].incomePlaidTransactionId).toBeNull()
    expect(inputs[0].amount).toBe('500.00')
  })

  it('records the counterpart amount for reimbursements, one row per linked income', () => {
    const partial = item({ id: 'i2', amount: -120, date: '2026-08-12' })
    const other = item({ id: 'i3', amount: -80, date: '2026-08-13' })
    const inputs = buildTransferInputs(
      expense,
      { kind: 'reimbursement', counterpartIds: ['i2', 'i3'] },
      [expense, partial, other],
    )
    expect(inputs.map((i) => i.amount)).toEqual(['120.00', '80.00'])
  })

  it('falls back to the marked item amount for a reimbursement with no counterpart', () => {
    const [input] = buildTransferInputs(expense, { kind: 'reimbursement', counterpartIds: [] }, feed)
    expect(input.amount).toBe('500.00')
  })

  it('skips counterpart ids that are no longer in the feed', () => {
    const [input] = buildTransferInputs(expense, { kind: 'account_transfer', counterpartIds: ['gone'] }, feed)
    expect(input.incomePlaidTransactionId).toBeNull()
    expect(input.incomeManualTransactionId).toBeNull()
  })
})
