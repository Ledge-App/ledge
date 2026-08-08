import { describe, expect, it } from 'vitest'
import { detectTransfers } from './autoMatch'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Account } from '@/types/domain'

// Accounts: two depositories, one credit card, one loan.
const accounts = [
  { account_id: 'checking', type: 'depository' },
  { account_id: 'savings', type: 'depository' },
  { account_id: 'visa', type: 'credit' },
  { account_id: 'mortgage', type: 'loan' },
] as unknown as Account[]

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
    ...overrides,
  }
}

// The canonical pair: tagged $500 payment out of checking, $500 landing on the visa.
const paymentOut = item({
  id: 'pay-out', amount: 500, date: '2026-08-01',
  accountId: 'checking', pfcDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
})
const paymentIn = item({ id: 'pay-in', amount: -500, date: '2026-08-03', accountId: 'visa' })

function detect(feed: FeedItem[], extra?: { deltaIds?: Set<string> | null; dismissedIds?: Set<string> }) {
  return detectTransfers({ feed, accounts, ...extra })
}

describe('detectTransfers: credit-card payments', () => {
  it('auto-applies a uniquely matched card payment and orients the legs', () => {
    const { autoApply, suggestions } = detect([paymentOut, paymentIn])
    expect(suggestions).toEqual([])
    expect(autoApply).toHaveLength(1)
    expect(autoApply[0]).toMatchObject({
      kind: 'credit_card_payment',
      expense: { id: 'pay-out' },
      income: { id: 'pay-in' },
      amount: 500,
    })
  })

  it('reconciles through the delta: a tagged card inflow drives and finds an old untagged outflow', () => {
    // Card linked later: the delta is the card's history; the months-old checking outflow
    // is already in the cache and carries no transfer tag at all.
    const oldOutflow = item({ id: 'old-out', amount: 500, date: '2026-08-01', accountId: 'checking' })
    const cardInflow = item({
      id: 'card-in', amount: -500, date: '2026-08-03', accountId: 'visa',
      pfcDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
    })
    const { autoApply } = detect([oldOutflow, cardInflow], { deltaIds: new Set(['card-in']) })
    expect(autoApply).toHaveLength(1)
    expect(autoApply[0]).toMatchObject({ kind: 'credit_card_payment', expense: { id: 'old-out' }, income: { id: 'card-in' } })
  })

  it('suggests instead of auto-applying when two credit inflows are candidates, defaulting to the nearest date', () => {
    const near = item({ id: 'in-near', amount: -500, date: '2026-08-02', accountId: 'visa' })
    const far = item({ id: 'in-far', amount: -500, date: '2026-08-06', accountId: 'visa' })
    const { autoApply, suggestions } = detect([paymentOut, near, far])
    expect(autoApply).toEqual([])
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].income.id).toBe('in-near')
  })

  it('suggests instead of auto-applying when the reverse direction is ambiguous', () => {
    // One credit inflow, but TWO same-amount outflows in the window — either could be the
    // payment. A one-directional check would silently pick whichever drove first.
    const otherOut = item({ id: 'rent-out', amount: 500, date: '2026-08-02', accountId: 'savings' })
    const { autoApply, suggestions } = detect([paymentOut, otherOut, paymentIn])
    expect(autoApply).toEqual([])
    expect(suggestions.length).toBeGreaterThan(0)
  })

  it('leaves an unmatched payment counted when no credit counterpart exists (card not linked)', () => {
    const { autoApply, suggestions } = detect([paymentOut])
    expect(autoApply).toEqual([])
    expect(suggestions).toEqual([])
  })

  it('produces one draft when both legs arrive in the same delta and drive from both sides', () => {
    const taggedIn = item({ ...paymentIn, pfcDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' })
    const { autoApply, suggestions } = detect([paymentOut, taggedIn], { deltaIds: new Set(['pay-out', 'pay-in']) })
    expect(autoApply).toHaveLength(1)
    expect(suggestions).toEqual([])
  })

  it('only suggests for an untagged credit-account inflow (weak driver), never auto-applies', () => {
    const untaggedOut = item({ id: 'old-out', amount: 500, date: '2026-08-01', accountId: 'checking' })
    const { autoApply, suggestions } = detect([untaggedOut, paymentIn], { deltaIds: new Set(['pay-in']) })
    expect(autoApply).toEqual([])
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({ kind: 'credit_card_payment', expense: { id: 'old-out' } })
  })

  it('never pairs a loan-account inflow: a mortgage payment is real spending', () => {
    const mortgagePayment = item({
      id: 'mort-out', amount: 2000, date: '2026-08-01',
      pfcDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', // even mis-tagged by Plaid
    })
    const mortgageIn = item({ id: 'mort-in', amount: -2000, date: '2026-08-02', accountId: 'mortgage' })
    const { autoApply, suggestions } = detect([mortgagePayment, mortgageIn])
    expect(autoApply).toEqual([])
    expect(suggestions).toEqual([])
  })
})

describe('detectTransfers: account transfers', () => {
  const transferOut = item({
    id: 'xfer-out', amount: 1000, date: '2026-08-01',
    accountId: 'checking', pfcDetailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
  })
  const transferIn = item({ id: 'xfer-in', amount: -1000, date: '2026-08-02', accountId: 'savings' })

  it('auto-applies an exact-tagged transfer to an untagged depository inflow', () => {
    const { autoApply, suggestions } = detect([transferOut, transferIn])
    expect(suggestions).toEqual([])
    expect(autoApply).toHaveLength(1)
    expect(autoApply[0]).toMatchObject({ kind: 'account_transfer', expense: { id: 'xfer-out' }, income: { id: 'xfer-in' } })
  })

  it('auto-applies when the tagged inflow drives against an untagged outflow', () => {
    const untaggedOut = item({ id: 'out', amount: 1000, date: '2026-08-01', accountId: 'checking' })
    const taggedIn = item({
      id: 'in', amount: -1000, date: '2026-08-02', accountId: 'savings',
      pfcDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER',
    })
    const { autoApply } = detect([untaggedOut, taggedIn], { deltaIds: new Set(['in']) })
    expect(autoApply).toHaveLength(1)
    expect(autoApply[0]).toMatchObject({ kind: 'account_transfer' })
  })

  it('never pairs against real income: a dividend is not a transfer leg', () => {
    const dividend = item({
      id: 'div', amount: -1000, date: '2026-08-02', accountId: 'savings',
      pfcDetailed: 'INCOME_DIVIDENDS',
    })
    const { autoApply, suggestions } = detect([transferOut, dividend])
    expect(autoApply).toEqual([])
    expect(suggestions).toEqual([])
  })

  it('treats P2P as a weak driver: suggestion only, even with a unique counterpart', () => {
    const venmoOut = item({
      id: 'venmo', amount: 75, date: '2026-08-01',
      accountId: 'checking', pfcDetailed: 'TRANSFER_OUT_PEER_TO_PEER_PAYMENT',
    })
    const inflow = item({ id: 'in', amount: -75, date: '2026-08-01', accountId: 'savings' })
    const { autoApply, suggestions } = detect([venmoOut, inflow])
    expect(autoApply).toEqual([])
    expect(suggestions).toHaveLength(1)
  })

  it('derives credit_card_payment kind when a generic TRANSFER_OUT lands on a credit account', () => {
    const genericOut = item({
      id: 'out', amount: 300, date: '2026-08-01',
      accountId: 'checking', pfcDetailed: 'TRANSFER_OUT_OTHER_TRANSFER_OUT',
    })
    const cardIn = item({ id: 'in', amount: -300, date: '2026-08-02', accountId: 'visa' })
    const { autoApply, suggestions } = detect([genericOut, cardIn])
    expect(autoApply).toEqual([])
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].kind).toBe('credit_card_payment')
  })

  it('surfaces a tag-conflicting pair as a suggestion, never an auto-apply', () => {
    // The outflow is tagged TRANSFER_OUT_ACCOUNT_TRANSFER but the only same-amount inflow
    // lands on the visa. Plaid outflow tags are noisy and an exact-amount credit inflow is
    // a strong structural hint the tag is wrong — so the exact driver refuses (kind
    // mismatch), and the credit inflow's own weak driver asks the user instead.
    const cardIn = item({ id: 'card-in', amount: -1000, date: '2026-08-02', accountId: 'visa' })
    const { autoApply, suggestions } = detect([transferOut, cardIn])
    expect(autoApply).toEqual([])
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({ kind: 'credit_card_payment', expense: { id: 'xfer-out' }, income: { id: 'card-in' } })
  })
})

describe('detectTransfers: gates', () => {
  it('requires the exact amount to the cent', () => {
    const offByOne = item({ ...paymentIn, id: 'in', amount: -500.01 })
    const { autoApply, suggestions } = detect([paymentOut, offByOne])
    expect(autoApply).toEqual([])
    expect(suggestions).toEqual([])
  })

  it('matches at the window boundary and refuses past it', () => {
    const day7 = item({ ...paymentIn, id: 'in-7', date: '2026-08-08' })
    expect(detect([paymentOut, day7]).autoApply).toHaveLength(1)

    const day8 = item({ ...paymentIn, id: 'in-8', date: '2026-08-09' })
    expect(detect([paymentOut, day8]).autoApply).toEqual([])
    expect(detect([paymentOut, day8]).suggestions).toEqual([])
  })

  it('never pairs two legs on the same account', () => {
    const sameAccountIn = item({ ...paymentIn, id: 'in', accountId: 'checking' })
    const result = detect([paymentOut, sameAccountIn])
    expect(result.autoApply).toEqual([])
    expect(result.suggestions).toEqual([])
  })

  it('skips pending legs entirely: their ids are replaced when they post', () => {
    const pendingIn = item({ ...paymentIn, id: 'in', pending: true })
    expect(detect([paymentOut, pendingIn]).autoApply).toEqual([])

    const pendingOut = item({ ...paymentOut, id: 'out', pending: true })
    expect(detect([pendingOut, paymentIn]).autoApply).toEqual([])
  })

  it('skips legs already in a transfer', () => {
    const alreadyLinked = item({ ...paymentIn, id: 'in', transferId: 't1', transferKind: 'credit_card_payment', transferRole: 'income' })
    expect(detect([paymentOut, alreadyLinked]).autoApply).toEqual([])
  })

  it('skips reimbursement-linked legs', () => {
    const reimbursed = item({ ...paymentOut, id: 'out', reimbursedAmount: 100, netAmount: 400 })
    expect(detect([reimbursed, paymentIn]).autoApply).toEqual([])
  })

  it('never re-creates a dismissed pair, from either side', () => {
    expect(detect([paymentOut, paymentIn], { dismissedIds: new Set(['pay-out']) }).autoApply).toEqual([])
    // Even when the income leg drives (delta), the dismissed expense is not a candidate.
    const taggedIn = item({ ...paymentIn, pfcDetailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' })
    const driven = detect([paymentOut, taggedIn], { deltaIds: new Set(['pay-in']), dismissedIds: new Set(['pay-out']) })
    expect(driven.autoApply).toEqual([])
    expect(driven.suggestions).toEqual([])
  })

  it('ignores manual transactions on both sides', () => {
    const manualOut = item({ ...paymentOut, id: 'm-out', source: 'manual', accountId: null })
    expect(detect([manualOut, paymentIn]).autoApply).toEqual([])
  })

  it('ignores items with unknown accounts', () => {
    const unknownIn = item({ ...paymentIn, id: 'in', accountId: 'not-linked' })
    expect(detect([paymentOut, unknownIn]).autoApply).toEqual([])
  })

  it('drives nothing when the delta contains only unrelated items', () => {
    const unrelated = item({ id: 'lunch', amount: 12, date: '2026-08-01' })
    const result = detect([paymentOut, paymentIn, unrelated], { deltaIds: new Set(['lunch']) })
    expect(result.autoApply).toEqual([])
    expect(result.suggestions).toEqual([])
  })

  it('a full scan (no delta) drives everything eligible', () => {
    const result = detect([paymentOut, paymentIn], { deltaIds: null })
    expect(result.autoApply).toHaveLength(1)
  })
})
