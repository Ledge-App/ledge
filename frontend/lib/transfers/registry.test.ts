import { describe, expect, it } from 'vitest'
import { TRANSFER_TYPES, daysBetween } from './registry'
import type { TransferContext } from './registry'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Account, TransferKind } from '@/types/domain'

function item(overrides: Partial<FeedItem> & Pick<FeedItem, 'id' | 'amount' | 'date'>): FeedItem {
  return {
    source: 'plaid',
    merchantName: 'Test',
    categoryId: null,
    subcategoryId: null,
    categorySource: 'uncategorized',
    confidenceLevel: null,
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
    ...overrides,
  }
}

const accounts = [
  { account_id: 'checking', type: 'depository' },
  { account_id: 'savings', type: 'depository' },
  { account_id: 'visa', type: 'credit' },
] as unknown as Account[]

const ctx: TransferContext = { accounts }

const expense = item({ id: 'e1', amount: 500, date: '2026-08-10', accountId: 'checking' })

function income(overrides: Partial<FeedItem>): FeedItem {
  return item({ id: 'i1', amount: -500, date: '2026-08-10', accountId: 'savings', ...overrides })
}

describe('daysBetween', () => {
  it('counts whole calendar days regardless of direction', () => {
    expect(daysBetween('2026-08-10', '2026-08-17')).toBe(7)
    expect(daysBetween('2026-08-17', '2026-08-10')).toBe(7)
  })

  it('is unaffected by a DST boundary', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
  })
})

describe('account_transfer.matches', () => {
  const { matches } = TRANSFER_TYPES.account_transfer

  it('accepts an exact-amount income leg on the same day', () => {
    expect(matches(expense, income({}), ctx)).toBe(true)
  })

  it('accepts an amount just inside the 5% tolerance', () => {
    expect(matches(expense, income({ amount: -475 }), ctx)).toBe(true)
    expect(matches(expense, income({ amount: -525 }), ctx)).toBe(true)
  })

  it('rejects an amount just outside the 5% tolerance', () => {
    expect(matches(expense, income({ amount: -474.99 }), ctx)).toBe(false)
    expect(matches(expense, income({ amount: -525.01 }), ctx)).toBe(false)
  })

  it('accepts a date exactly 7 days away on either side', () => {
    expect(matches(expense, income({ date: '2026-08-17' }), ctx)).toBe(true)
    expect(matches(expense, income({ date: '2026-08-03' }), ctx)).toBe(true)
  })

  it('rejects a date 8 days away', () => {
    expect(matches(expense, income({ date: '2026-08-18' }), ctx)).toBe(false)
    expect(matches(expense, income({ date: '2026-08-02' }), ctx)).toBe(false)
  })

  it('rejects a candidate on the same account — a transfer moves money between accounts', () => {
    expect(matches(expense, income({ accountId: 'checking' }), ctx)).toBe(false)
  })

  it('accepts a manual candidate, which has no account of its own', () => {
    expect(matches(expense, income({ accountId: null, source: 'manual' }), ctx)).toBe(true)
  })

  it('rejects an expense — the counterparty must be income', () => {
    expect(matches(expense, income({ amount: 500 }), ctx)).toBe(false)
  })

  it('rejects the expense itself', () => {
    expect(matches(expense, { ...expense, amount: -500 }, ctx)).toBe(false)
  })
})

describe('credit_card_payment.matches', () => {
  const { matches } = TRANSFER_TYPES.credit_card_payment

  it('accepts an income leg landing on a credit account', () => {
    expect(matches(expense, income({ accountId: 'visa' }), ctx)).toBe(true)
  })

  it('rejects an income leg on a depository account', () => {
    expect(matches(expense, income({ accountId: 'savings' }), ctx)).toBe(false)
  })

  it('rejects a manual candidate, which has no account to check', () => {
    expect(matches(expense, income({ accountId: null, source: 'manual' }), ctx)).toBe(false)
  })

  it('rejects an unknown account id', () => {
    expect(matches(expense, income({ accountId: 'not-connected' }), ctx)).toBe(false)
  })

  it('still enforces the shared amount and date window', () => {
    expect(matches(expense, income({ accountId: 'visa', amount: -600 }), ctx)).toBe(false)
    expect(matches(expense, income({ accountId: 'visa', date: '2026-08-20' }), ctx)).toBe(false)
  })
})

describe('TRANSFER_TYPES', () => {
  it('defines every field of the interface for each kind, keyed by its own kind', () => {
    for (const [key, definition] of Object.entries(TRANSFER_TYPES)) {
      expect(definition.kind).toBe(key as TransferKind)
      expect(definition.label.length).toBeGreaterThan(0)
      expect(definition.description.length).toBeGreaterThan(0)
      expect(definition.icon.length).toBeGreaterThan(0)
      expect(definition.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      expect(typeof definition.appliesTo).toBe('function')
      expect(typeof definition.matches).toBe('function')
      expect(typeof definition.allowsUnpaired).toBe('boolean')
    }
  })
})
