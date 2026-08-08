import { describe, expect, it } from 'vitest'
import { countsTowardTotals, isInternalMovement, isTransfer } from './totals'
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
    isBrokerageCashAccount: false,
    isSweptOutflow: false,
    ...overrides,
  }
}

/** A row on a brokerage cash account (Fidelity CMA and the like), where sweeps happen. */
function sweepItem(overrides: Partial<FeedItem>): FeedItem {
  return item({ isBrokerageCashAccount: true, ...overrides })
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

  it('skips a cash-management sweep that has no transfer record', () => {
    expect(countsTowardTotals(sweepItem({ pfcDetailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' }))).toBe(false)
  })
})

// A brokerage cash account sweeps deposits into a fund, and Plaid reports the sweep as an outflow.
// Pairing can't rescue it either way: the counterpart is either an investment transaction (a
// different Plaid product, never in /transactions/sync) or — as Fidelity reports it — a second leg
// on the SAME account, which autoMatch's pairAllowed rejects. Hence the PFC route, and hence the
// scope: only on accounts where that's true, never on ordinary checking.
describe('isInternalMovement', () => {
  it('is true for an investment or retirement sweep in either direction', () => {
    expect(isInternalMovement(sweepItem({ pfcDetailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' }))).toBe(true)
    expect(isInternalMovement(sweepItem({ pfcDetailed: 'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS', amount: -500 }))).toBe(true)
  })

  it('is true for a savings sweep in either direction', () => {
    expect(isInternalMovement(sweepItem({ pfcDetailed: 'TRANSFER_OUT_SAVINGS' }))).toBe(true)
    expect(isInternalMovement(sweepItem({ pfcDetailed: 'TRANSFER_IN_SAVINGS', amount: -500 }))).toBe(true)
  })

  // The exclusion is scoped to accounts where pairing structurally can't work. On an ordinary
  // checking account the same code is left counted on purpose: autoMatch pairs it with a linked
  // counterpart (which sets transferKind), and an unpaired leg staying counted is the documented
  // bias — leave money counted rather than wrongly hide it.
  it('is false for the same codes on an ordinary checking account', () => {
    expect(isInternalMovement(item({ pfcDetailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' }))).toBe(false)
    expect(isInternalMovement(item({ pfcDetailed: 'TRANSFER_OUT_SAVINGS' }))).toBe(false)
    expect(isInternalMovement(item({ pfcDetailed: 'TRANSFER_IN_SAVINGS', amount: -500 }))).toBe(false)
  })

  it('still excludes a paired transfer on a checking account, via its transfer record', () => {
    expect(isInternalMovement(item({ pfcDetailed: 'TRANSFER_OUT_SAVINGS', transferKind: 'account_transfer', transferRole: 'expense' }))).toBe(true)
  })

  it('still covers anything carrying a transfer record, whatever its PFC', () => {
    expect(isInternalMovement(item({ transferKind: 'credit_card_payment', transferRole: 'expense' }))).toBe(true)
    expect(isInternalMovement(item({ transferKind: 'account_transfer', transferRole: 'income' }))).toBe(true)
  })

  // An unlinked card's payment is the only visible proxy for the purchases made on that card,
  // so excluding it by PFC would make spend totals under-count. Pairing handles the linked
  // case (autoMatch's CC_PAYMENT_CODE driver), and that path sets transferKind.
  it('does not exclude a credit card payment on PFC alone', () => {
    expect(isInternalMovement(item({ pfcDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' }))).toBe(false)
  })

  // Plaid: "Cash, checks, and ATM deposits into a bank account" — arriving from outside.
  it('does not exclude a deposit', () => {
    expect(isInternalMovement(item({ pfcDetailed: 'TRANSFER_IN_DEPOSIT', amount: -2400 }))).toBe(false)
  })

  it('does not exclude a cash withdrawal, which gets spent later', () => {
    expect(isInternalMovement(item({ pfcDetailed: 'TRANSFER_OUT_WITHDRAWAL' }))).toBe(false)
  })

  // Left out deliberately. Plaid's taxonomy has no peer-to-peer code, so Venmo/Zelle to a person
  // lands on the generic account-transfer code alongside genuine internal moves — as does ACH
  // rent. Excluding it wholesale would hide real spending.
  it('does not exclude a generic account transfer without a transfer record', () => {
    expect(isInternalMovement(item({ pfcDetailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER' }))).toBe(false)
    expect(isInternalMovement(item({ pfcDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER', amount: -50 }))).toBe(false)
  })

  it('is false for an ordinary item and for a manual transaction with no PFC', () => {
    expect(isInternalMovement(item({}))).toBe(false)
    expect(isInternalMovement(item({ source: 'manual', pfcDetailed: null }))).toBe(false)
  })
})
