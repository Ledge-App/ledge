import { describe, expect, it } from 'vitest'
import { countsTowardTotals, isTransfer } from './totals'
import type { FeedItem } from './resolveFeed'

function item(overrides: Partial<FeedItem>): FeedItem {
  return {
    id: 'i1',
    source: 'plaid',
    amount: 100,
    date: '2026-08-10',
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
    ...overrides,
  }
}

describe('isTransfer', () => {
  it('is true for either leg and false for an ordinary item', () => {
    expect(isTransfer(item({ transferKind: 'account_transfer', transferRole: 'expense' }))).toBe(true)
    expect(isTransfer(item({ transferKind: 'account_transfer', transferRole: 'income' }))).toBe(true)
    expect(isTransfer(item({}))).toBe(false)
  })
})

describe('countsTowardTotals', () => {
  it('counts an ordinary transaction', () => {
    expect(countsTowardTotals(item({}))).toBe(true)
  })

  it('skips a reimbursement income leg', () => {
    expect(countsTowardTotals(item({ isReimbursementIncome: true }))).toBe(false)
  })

  it('skips both legs of a transfer', () => {
    expect(countsTowardTotals(item({ transferKind: 'account_transfer', transferRole: 'expense' }))).toBe(false)
    expect(countsTowardTotals(item({ transferKind: 'account_transfer', transferRole: 'income' }))).toBe(false)
  })

  it('skips an unpaired transfer — the money still did not leave the user', () => {
    expect(countsTowardTotals(item({ transferKind: 'account_transfer', transferRole: 'expense' }))).toBe(false)
  })

  it('skips a credit card payment', () => {
    expect(countsTowardTotals(item({ transferKind: 'credit_card_payment', transferRole: 'expense' }))).toBe(false)
  })
})
