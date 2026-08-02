import { describe, expect, it } from 'vitest'
import { resolveCategory, mergeFeed, applyReimbursements } from './resolveFeed'
import type { TransactionOverride, VendorMapping, ManualTransaction, PlaidTransaction, Reimbursement } from '@/types/domain'

const overrides: TransactionOverride[] = [
  { id: 'o1', plaidTransactionId: 'txn-override', categoryId: 'cat-override', subcategoryId: null },
]
const vendorMappings: VendorMapping[] = [
  { id: 'v1', vendorName: 'Panda Express', categoryId: 'cat-user', subcategoryId: 'sub-user', source: 'user_defined' },
  { id: 'v2', vendorName: 'Panda Express', categoryId: 'cat-auto', subcategoryId: null, source: 'plaid_auto' },
  { id: 'v3', vendorName: 'Only Auto Vendor', categoryId: 'cat-auto-only', subcategoryId: null, source: 'plaid_auto' },
]

describe('resolveCategory', () => {
  it('prefers a transaction_override over any vendor mapping', () => {
    const result = resolveCategory({ transactionId: 'txn-override', merchantName: 'Panda Express' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: 'cat-override', subcategoryId: null, categorySource: 'override' })
  })

  it('prefers a user_defined vendor mapping over a plaid_auto one for the same merchant', () => {
    const result = resolveCategory({ transactionId: 'txn-other', merchantName: 'Panda Express' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: 'cat-user', subcategoryId: 'sub-user', categorySource: 'user_defined' })
  })

  it('falls back to plaid_auto when no user_defined mapping exists for the merchant', () => {
    const result = resolveCategory({ transactionId: 'txn-other', merchantName: 'Only Auto Vendor' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: 'cat-auto-only', subcategoryId: null, categorySource: 'plaid_auto' })
  })

  it('falls back to uncategorized when nothing matches', () => {
    const result = resolveCategory({ transactionId: 'txn-unknown', merchantName: 'Unknown Merchant' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: null, subcategoryId: null, categorySource: 'uncategorized' })
  })

  it('falls back to uncategorized when merchantName is null', () => {
    const result = resolveCategory({ transactionId: 'txn-null-merchant', merchantName: null }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: null, subcategoryId: null, categorySource: 'uncategorized' })
  })
})

describe('mergeFeed', () => {
  const plaidTxns = [
    {
      transaction_id: 'p1',
      account_id: 'acc-1',
      amount: 35.5,
      date: '2026-06-21',
      name: 'PANDA EXPRESS #123',
      merchant_name: 'Panda Express',
      pending: false,
      personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_FAST_FOOD', confidence_level: 'HIGH' },
    },
  ] as unknown as PlaidTransaction[]

  const manualTxns = [
    { id: 'm1', amount: '5.00', type: 'expense', categoryId: 'cat-food', subcategoryId: null, date: '2026-06-20', note: 'Street food' },
    { id: 'm2', amount: '30.00', type: 'income', categoryId: null, subcategoryId: null, date: '2026-06-19', note: 'Zelle from Alice' },
  ] as ManualTransaction[]

  it('merges Plaid and manual transactions into one array, sorted by date descending', () => {
    const feed = mergeFeed(plaidTxns, manualTxns, [], [])
    expect(feed.map((item) => item.id)).toEqual(['p1', 'm1', 'm2'])
  })

  it('tags each item with its source and resolves Plaid category via resolveCategory', () => {
    const vendorMappings = [{ id: 'v1', vendorName: 'Panda Express', categoryId: 'cat-food', subcategoryId: null, source: 'plaid_auto' as const }]
    const feed = mergeFeed(plaidTxns, [], [], vendorMappings)
    expect(feed[0]).toMatchObject({ source: 'plaid', categoryId: 'cat-food', categorySource: 'plaid_auto', merchantName: 'Panda Express' })
  })

  it('gives manual expenses a positive amount and manual income a negative amount, matching Plaid convention', () => {
    const feed = mergeFeed([], manualTxns, [], [])
    const expense = feed.find((item) => item.id === 'm1')!
    const income = feed.find((item) => item.id === 'm2')!
    expect(expense.amount).toBe(5)
    expect(income.amount).toBe(-30)
  })

  it('uses the manual transaction note as its display merchant name', () => {
    const feed = mergeFeed([], manualTxns, [], [])
    expect(feed.find((item) => item.id === 'm1')!.merchantName).toBe('Street food')
  })
})

describe('applyReimbursements', () => {
  const baseFeed = [
    {
      id: 'expense-1', source: 'plaid', amount: 100, date: '2026-06-21', merchantName: 'Dinner', categoryId: 'cat-food',
      subcategoryId: null, categorySource: 'plaid_auto', confidenceLevel: 'HIGH', accountId: 'acc-1', pending: false,
      note: null, reimbursedAmount: null, netAmount: null, isReimbursementIncome: false, reimbursementCategoryId: null,
    },
    {
      id: 'income-alice', source: 'plaid', amount: -30, date: '2026-06-19', merchantName: 'Zelle from Alice', categoryId: 'cat-transfers-in',
      subcategoryId: null, categorySource: 'plaid_auto', confidenceLevel: 'HIGH', accountId: 'acc-1', pending: false,
      note: null, reimbursedAmount: null, netAmount: null, isReimbursementIncome: false, reimbursementCategoryId: null,
    },
    {
      id: 'income-bob', source: 'plaid', amount: -30, date: '2026-06-20', merchantName: 'Zelle from Bob', categoryId: 'cat-transfers-in',
      subcategoryId: null, categorySource: 'plaid_auto', confidenceLevel: 'HIGH', accountId: 'acc-1', pending: false,
      note: null, reimbursedAmount: null, netAmount: null, isReimbursementIncome: false, reimbursementCategoryId: null,
    },
  ] as unknown as ReturnType<typeof mergeFeed>

  const reimbursements: Reimbursement[] = [
    { id: 'r1', expensePlaidTransactionId: 'expense-1', expenseManualTransactionId: null, incomePlaidTransactionId: 'income-alice', incomeManualTransactionId: null, amount: '30.00', note: null },
    { id: 'r2', expensePlaidTransactionId: 'expense-1', expenseManualTransactionId: null, incomePlaidTransactionId: 'income-bob', incomeManualTransactionId: null, amount: '30.00', note: null },
  ]

  it('computes net expense as original minus the sum of all linked reimbursements', () => {
    const result = applyReimbursements(baseFeed, reimbursements)
    const expense = result.find((item) => item.id === 'expense-1')!
    expect(expense.reimbursedAmount).toBe(60)
    expect(expense.netAmount).toBe(40)
  })

  it('tags each linked income row as a reimbursement, carrying the expense category', () => {
    const result = applyReimbursements(baseFeed, reimbursements)
    const alice = result.find((item) => item.id === 'income-alice')!
    expect(alice.isReimbursementIncome).toBe(true)
    expect(alice.reimbursementCategoryId).toBe('cat-food')
  })

  it('never lets net expense go negative when reimbursements exceed the original amount', () => {
    const overReimbursed: Reimbursement[] = [
      { id: 'r1', expensePlaidTransactionId: 'expense-1', expenseManualTransactionId: null, incomePlaidTransactionId: 'income-alice', incomeManualTransactionId: null, amount: '150.00', note: null },
    ]
    const result = applyReimbursements(baseFeed, overReimbursed)
    expect(result.find((item) => item.id === 'expense-1')!.netAmount).toBe(0)
  })

  it('leaves unrelated feed items unchanged', () => {
    const result = applyReimbursements(baseFeed, [])
    expect(result).toEqual(baseFeed)
  })
})
