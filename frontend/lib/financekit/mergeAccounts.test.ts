import { describe, expect, it } from 'vitest'
import { FINANCEKIT_ITEM_ID, mergeFinanceKitIntoAccounts, plaidItemIdsFrom } from './mergeAccounts'
import { adaptAccount, type AdaptedAccount } from './adaptAccount'
import type { FinanceKitSyncResult } from './syncEngine'

const bankAccount = { account_id: 'plaid-1', name: 'Checking' }
const backend = {
  accounts: [bankAccount],
  itemErrors: [{ itemId: 'item-1', institutionName: 'Chase', message: 'ITEM_LOGIN_REQUIRED' }],
}

// Built through the real adapter rather than hand-written: a hand-written fixture would drift from
// what adaptAccount actually produces, which is the thing this merge has to carry.
const appleCard: AdaptedAccount = adaptAccount(
  {
    kind: 'liability',
    id: 'acc-card',
    displayName: 'Apple Card',
    accountDescription: null,
    institutionName: 'Apple Card',
    currencyCode: 'USD',
    creditLimit: 5000,
    balance: 313.29,
  },
  undefined,
)

const authorized: FinanceKitSyncResult = { status: 'authorized', accounts: [appleCard] }

describe('mergeFinanceKitIntoAccounts', () => {
  it('appends authorized FinanceKit accounts after the backend ones', () => {
    const result = mergeFinanceKitIntoAccounts(backend, authorized)
    expect(result.accounts).toEqual([bankAccount, appleCard])
  })

  it('tags backend item errors as plaid so the repair action stays Plaid-only', () => {
    const result = mergeFinanceKitIntoAccounts(backend, authorized)
    expect(result.itemErrors).toEqual([
      { itemId: 'item-1', institutionName: 'Chase', message: 'ITEM_LOGIN_REQUIRED', kind: 'plaid' },
    ])
  })

  it('synthesizes a financekit-kind item error when access was denied', () => {
    const result = mergeFinanceKitIntoAccounts(backend, { status: 'denied', accounts: [] })
    const synthesized = result.itemErrors.find((e) => e.itemId === 'financekit')
    expect(synthesized).toMatchObject({ kind: 'financekit', institutionName: 'Apple' })
  })

  it('treats restricted the same as denied', () => {
    const result = mergeFinanceKitIntoAccounts(backend, { status: 'restricted', accounts: [] })
    expect(result.itemErrors.some((e) => e.kind === 'financekit')).toBe(true)
  })

  it('says nothing at all when the device cannot provide FinanceKit data', () => {
    const result = mergeFinanceKitIntoAccounts(backend, { status: 'unavailable', accounts: [] })
    expect(result.accounts).toEqual([bankAccount])
    expect(result.itemErrors.some((e) => e.kind === 'financekit')).toBe(false)
  })

  it('says nothing when the user has simply never been asked', () => {
    const result = mergeFinanceKitIntoAccounts(backend, { status: 'notDetermined', accounts: [] })
    expect(result.itemErrors.some((e) => e.kind === 'financekit')).toBe(false)
  })

  it('passes the backend through untouched before the first sync has run', () => {
    const result = mergeFinanceKitIntoAccounts(backend, null)
    expect(result.accounts).toEqual([bankAccount])
    expect(result.itemErrors).toEqual([
      { itemId: 'item-1', institutionName: 'Chase', message: 'ITEM_LOGIN_REQUIRED', kind: 'plaid' },
    ])
  })
})

describe('plaidItemIdsFrom', () => {
  it('excludes the synthetic FinanceKit itemId, which no Plaid call may ever receive', () => {
    const accounts = [
      { itemId: 'item-1' },
      { itemId: FINANCEKIT_ITEM_ID },
      { itemId: 'item-2' },
    ]
    expect(plaidItemIdsFrom(accounts)).toEqual(['item-1', 'item-2'])
  })

  it('de-duplicates itemIds shared by several accounts', () => {
    expect(plaidItemIdsFrom([{ itemId: 'item-1' }, { itemId: 'item-1' }])).toEqual(['item-1'])
  })

  it('returns nothing when the only accounts are FinanceKit ones', () => {
    expect(plaidItemIdsFrom([{ itemId: FINANCEKIT_ITEM_ID }])).toEqual([])
  })
})
