import { describe, expect, it } from 'vitest'
import { resolveCategory, mergeFeed, applyReimbursements, applyTransfers } from './resolveFeed'
import type { TransactionOverride, VendorMapping, ManualTransaction, PlaidTransaction, Reimbursement, Transfer } from '@/types/domain'

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

// Shared by the applyReimbursements suite and the end-to-end pipeline suite below: the
// product.md $100 dinner split three ways, in raw Plaid shape rather than pre-built FeedItems.
const dinnerPlaidTxns = [
  {
    transaction_id: 'expense-1', account_id: 'acc-1', amount: 100, date: '2026-06-21', name: 'THE GOOD FORK',
    merchant_name: 'Dinner', pending: false,
    personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_RESTAURANT', confidence_level: 'HIGH' },
  },
  {
    transaction_id: 'income-alice', account_id: 'acc-1', amount: -30, date: '2026-06-19', name: 'ZELLE FROM ALICE',
    merchant_name: 'Zelle from Alice', pending: false,
    personal_finance_category: { primary: 'TRANSFER_IN', detailed: 'TRANSFER_IN_ACCOUNT_TRANSFER', confidence_level: 'HIGH' },
  },
  {
    transaction_id: 'income-bob', account_id: 'acc-1', amount: -30, date: '2026-06-20', name: 'ZELLE FROM BOB',
    merchant_name: 'Zelle from Bob', pending: false,
    personal_finance_category: { primary: 'TRANSFER_IN', detailed: 'TRANSFER_IN_ACCOUNT_TRANSFER', confidence_level: 'HIGH' },
  },
] as unknown as PlaidTransaction[]

const dinnerVendorMappings: VendorMapping[] = [
  { id: 'vm-dinner', vendorName: 'Dinner', categoryId: 'cat-food', subcategoryId: null, source: 'plaid_auto' },
  { id: 'vm-alice', vendorName: 'Zelle from Alice', categoryId: 'cat-transfers-in', subcategoryId: null, source: 'plaid_auto' },
  { id: 'vm-bob', vendorName: 'Zelle from Bob', categoryId: 'cat-transfers-in', subcategoryId: null, source: 'plaid_auto' },
]

describe('applyReimbursements', () => {
  // Built by actually running mergeFeed, so a FeedItem shape change breaks these tests
  // instead of silently passing behind a cast.
  const baseFeed = mergeFeed(dinnerPlaidTxns, [], [], dinnerVendorMappings)

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

// End-to-end: resolveCategory -> mergeFeed -> applyReimbursements chained on one realistic
// dataset, starting from raw Plaid/manual shapes rather than hand-built FeedItems. This is
// the product.md $100 dinner / $30 Alice / $30 Bob / $40 net scenario.
describe('resolveFeed pipeline', () => {
  const pipelineOverrides: TransactionOverride[] = [
    // User re-categorized the dinner away from its plaid_auto mapping.
    { id: 'o-dinner', plaidTransactionId: 'expense-1', categoryId: 'cat-dining-out', subcategoryId: 'sub-restaurants' },
  ]

  const manualTxns = [
    { id: 'm-coffee', amount: '4.75', type: 'expense', categoryId: 'cat-food', subcategoryId: null, date: '2026-06-22', note: 'Coffee cart' },
  ] as ManualTransaction[]

  const pipelineReimbursements: Reimbursement[] = [
    { id: 'r1', expensePlaidTransactionId: 'expense-1', expenseManualTransactionId: null, incomePlaidTransactionId: 'income-alice', incomeManualTransactionId: null, amount: '30.00', note: null },
    { id: 'r2', expensePlaidTransactionId: 'expense-1', expenseManualTransactionId: null, incomePlaidTransactionId: 'income-bob', incomeManualTransactionId: null, amount: '30.00', note: null },
  ]

  function runPipeline() {
    const merged = mergeFeed(dinnerPlaidTxns, manualTxns, pipelineOverrides, dinnerVendorMappings)
    return applyReimbursements(merged, pipelineReimbursements)
  }

  it('sorts the merged Plaid + manual feed by date descending', () => {
    expect(runPipeline().map((item) => item.id)).toEqual(['m-coffee', 'expense-1', 'income-bob', 'income-alice'])
  })

  it('resolves categories through the full precedence chain before reimbursements are applied', () => {
    const result = runPipeline()
    const dinner = result.find((item) => item.id === 'expense-1')!
    const alice = result.find((item) => item.id === 'income-alice')!
    const coffee = result.find((item) => item.id === 'm-coffee')!

    expect(dinner).toMatchObject({ categoryId: 'cat-dining-out', subcategoryId: 'sub-restaurants', categorySource: 'override' })
    expect(alice).toMatchObject({ categoryId: 'cat-transfers-in', categorySource: 'plaid_auto' })
    expect(coffee).toMatchObject({ source: 'manual', categoryId: 'cat-food', categorySource: 'user_defined', amount: 4.75 })
  })

  it('nets the $100 expense down to $40 after two $30 reimbursements', () => {
    const dinner = runPipeline().find((item) => item.id === 'expense-1')!
    expect(dinner.amount).toBe(100)
    expect(dinner.reimbursedAmount).toBe(60)
    expect(dinner.netAmount).toBe(40)
  })

  it('tags both income rows as reimbursements carrying the overridden expense category', () => {
    const result = runPipeline()
    for (const id of ['income-alice', 'income-bob']) {
      const income = result.find((item) => item.id === id)!
      expect(income.amount).toBe(-30)
      expect(income.isReimbursementIncome).toBe(true)
      // The override, not the vendor mapping, is what propagates to the income rows.
      expect(income.reimbursementCategoryId).toBe('cat-dining-out')
    }
  })

  it('leaves the unrelated manual expense untouched by reimbursement math', () => {
    const coffee = runPipeline().find((item) => item.id === 'm-coffee')!
    expect(coffee.reimbursedAmount).toBeNull()
    expect(coffee.netAmount).toBeNull()
    expect(coffee.isReimbursementIncome).toBe(false)
  })
})

describe('applyTransfers', () => {
  const plaidTxns = [
    { transaction_id: 'out', account_id: 'checking', amount: 500, date: '2026-08-10', name: 'TRANSFER TO SAVINGS', merchant_name: null, pending: false },
    { transaction_id: 'in', account_id: 'savings', amount: -500, date: '2026-08-11', name: 'TRANSFER FROM CHECKING', merchant_name: null, pending: false },
    { transaction_id: 'lunch', account_id: 'checking', amount: 12, date: '2026-08-10', name: 'DELI', merchant_name: 'Deli', pending: false },
  ] as unknown as PlaidTransaction[]

  const feed = mergeFeed(plaidTxns, [], [], [])

  function find(items: ReturnType<typeof mergeFeed>, id: string) {
    return items.find((item) => item.id === id)!
  }

  it('stamps both legs of a paired transfer with the same id and kind', () => {
    const transfers: Transfer[] = [
      { id: 't1', kind: 'account_transfer', expensePlaidTransactionId: 'out', expenseManualTransactionId: null, incomePlaidTransactionId: 'in', incomeManualTransactionId: null, amount: '500.00', note: null },
    ]
    const result = applyTransfers(feed, transfers)

    expect(find(result, 'out')).toMatchObject({ transferId: 't1', transferKind: 'account_transfer', transferRole: 'expense' })
    expect(find(result, 'in')).toMatchObject({ transferId: 't1', transferKind: 'account_transfer', transferRole: 'income' })
  })

  it('stamps only the expense when the transfer is unpaired', () => {
    const transfers: Transfer[] = [
      { id: 't1', kind: 'account_transfer', expensePlaidTransactionId: 'out', expenseManualTransactionId: null, incomePlaidTransactionId: null, incomeManualTransactionId: null, amount: '500.00', note: null },
    ]
    const result = applyTransfers(feed, transfers)

    expect(find(result, 'out').transferRole).toBe('expense')
    expect(find(result, 'in').transferKind).toBeNull()
  })

  it('still stamps the expense when the income leg falls outside the loaded window', () => {
    const transfers: Transfer[] = [
      { id: 't1', kind: 'account_transfer', expensePlaidTransactionId: 'out', expenseManualTransactionId: null, incomePlaidTransactionId: 'not-loaded', incomeManualTransactionId: null, amount: '500.00', note: null },
    ]
    const result = applyTransfers(feed, transfers)

    expect(find(result, 'out')).toMatchObject({ transferId: 't1', transferRole: 'expense' })
  })

  it('resolves manual-transaction legs by their uuid', () => {
    const manualTxns = [
      { id: 'm-out', amount: '200.00', type: 'expense', categoryId: null, subcategoryId: null, date: '2026-08-10', note: 'Cash to savings' },
    ] as ManualTransaction[]
    const withManual = mergeFeed(plaidTxns, manualTxns, [], [])
    const transfers: Transfer[] = [
      { id: 't2', kind: 'credit_card_payment', expensePlaidTransactionId: null, expenseManualTransactionId: 'm-out', incomePlaidTransactionId: null, incomeManualTransactionId: null, amount: '200.00', note: null },
    ]
    const result = applyTransfers(withManual, transfers)

    expect(find(result, 'm-out')).toMatchObject({ transferId: 't2', transferKind: 'credit_card_payment', transferRole: 'expense' })
  })

  it('leaves unrelated transactions untouched', () => {
    const transfers: Transfer[] = [
      { id: 't1', kind: 'account_transfer', expensePlaidTransactionId: 'out', expenseManualTransactionId: null, incomePlaidTransactionId: 'in', incomeManualTransactionId: null, amount: '500.00', note: null },
    ]
    const result = applyTransfers(feed, transfers)

    expect(find(result, 'lunch')).toMatchObject({ transferId: null, transferKind: null, transferRole: null })
  })

  it('returns the feed unchanged when there are no transfers', () => {
    expect(applyTransfers(feed, [])).toEqual(feed)
  })

  it('sets reimbursedAmount and netAmount for reimbursement-kind transfers', () => {
    const transfers: Transfer[] = [
      { id: 'r1', kind: 'reimbursement', expensePlaidTransactionId: 'out', expenseManualTransactionId: null, incomePlaidTransactionId: 'in', incomeManualTransactionId: null, amount: '200.00', note: null },
    ]
    const result = applyTransfers(feed, transfers)

    expect(find(result, 'out')).toMatchObject({ reimbursedAmount: 200, netAmount: 300 })
    expect(find(result, 'in')).toMatchObject({ isReimbursementIncome: true })
  })

  it('accumulates multiple reimbursement transfers on the same expense', () => {
    const transfers: Transfer[] = [
      { id: 'r1', kind: 'reimbursement', expensePlaidTransactionId: 'out', expenseManualTransactionId: null, incomePlaidTransactionId: 'in', incomeManualTransactionId: null, amount: '200.00', note: null },
      { id: 'r2', kind: 'reimbursement', expensePlaidTransactionId: 'out', expenseManualTransactionId: null, incomePlaidTransactionId: null, incomeManualTransactionId: null, amount: '100.00', note: null },
    ]
    const result = applyTransfers(feed, transfers)

    expect(find(result, 'out')).toMatchObject({ reimbursedAmount: 300, netAmount: 200 })
  })

  it('floors netAmount at zero when reimbursements exceed expense', () => {
    const transfers: Transfer[] = [
      { id: 'r1', kind: 'reimbursement', expensePlaidTransactionId: 'out', expenseManualTransactionId: null, incomePlaidTransactionId: 'in', incomeManualTransactionId: null, amount: '600.00', note: null },
    ]
    const result = applyTransfers(feed, transfers)

    expect(find(result, 'out')).toMatchObject({ reimbursedAmount: 600, netAmount: 0 })
  })

  it('carries the expense category to the reimbursement income leg', () => {
    const catFeed = mergeFeed(plaidTxns, [], [{ id: 'o1', plaidTransactionId: 'out', categoryId: 'food', subcategoryId: null }] as unknown as import('@/types/domain').TransactionOverride[], [])
    const transfers: Transfer[] = [
      { id: 'r1', kind: 'reimbursement', expensePlaidTransactionId: 'out', expenseManualTransactionId: null, incomePlaidTransactionId: 'in', incomeManualTransactionId: null, amount: '200.00', note: null },
    ]
    const result = applyTransfers(catFeed, transfers)

    expect(find(result, 'in').reimbursementCategoryId).toBe('food')
  })
})
