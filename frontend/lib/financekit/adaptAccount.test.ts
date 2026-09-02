import { describe, expect, it } from 'vitest'
import { adaptAccount } from './adaptAccount'
import type { RawAccount, RawBalance } from './types'

const card: RawAccount = {
  kind: 'liability',
  id: 'ACC00000-0000-0000-0000-000000000001',
  displayName: 'Apple Card',
  accountDescription: 'Mastercard',
  institutionName: 'Apple Card',
  currencyCode: 'USD',
  creditLimit: 5000,
  balance: 313.29,
}

const savings: RawAccount = {
  kind: 'asset',
  id: 'ACC00000-0000-0000-0000-000000000002',
  displayName: 'Savings',
  accountDescription: null,
  institutionName: 'Apple Savings',
  currencyCode: 'USD',
  creditLimit: null,
  balance: 0,
}

const cash: RawAccount = { ...savings, id: 'ACC00000-0000-0000-0000-000000000003', displayName: 'Apple Cash', institutionName: 'Apple Cash' }

describe('adaptAccount', () => {
  it('maps a liability account to a Plaid credit card', () => {
    const result = adaptAccount(card, undefined)
    expect(result.type).toBe('credit')
    expect(result.subtype).toBe('credit card')
    expect(result.balances.limit).toBe(5000)
  })

  it('maps a savings asset account to a depository savings account', () => {
    const result = adaptAccount(savings, undefined)
    expect(result.type).toBe('depository')
    expect(result.subtype).toBe('savings')
  })

  it('maps Apple Cash to a depository prepaid account', () => {
    expect(adaptAccount(cash, undefined).subtype).toBe('prepaid')
  })

  it('tags every account with the synthetic financekit itemId so grouping works', () => {
    const result = adaptAccount(card, undefined)
    expect(result.itemId).toBe('financekit')
    expect(result.mask).toBeNull()
    expect(result.institutionLogo).toBeNull()
  })

  it('maps an availableAndBooked balance onto available and current', () => {
    const balance: RawBalance = { accountID: card.id, available: 4200, booked: 800, currencyCode: 'USD' }
    const result = adaptAccount(card, balance)
    expect(result.balances.available).toBe(4200)
    expect(result.balances.current).toBe(800)
  })

  it('has no available figure when FinanceKit returned no balance row', () => {
    const result = adaptAccount(card, undefined)
    expect(result.balances.available).toBeNull()
    // current still resolves, from the package's computed balance.
    expect(result.balances.current).toBe(313.29)
  })

  it('leaves current null only when there is no balance from either source', () => {
    const result = adaptAccount({ ...card, balance: null }, undefined)
    expect(result.balances.current).toBeNull()
  })

  it('falls back to the package’s computed balance when Apple reports no booked side', () => {
    // Apple does not always return a booked balance. Reading only `booked` is what showed $0.00 for
    // every Apple account; the package's own computed figure is creditLimit - available, i.e. owed.
    const balance: RawBalance = { accountID: card.id, available: 8500, booked: null, currencyCode: 'USD' }
    expect(adaptAccount(card, balance).balances.current).toBe(313.29)
  })

  it('prefers the booked balance over the computed fallback when both exist', () => {
    const balance: RawBalance = { accountID: card.id, available: 8500, booked: 420, currencyCode: 'USD' }
    expect(adaptAccount(card, balance).balances.current).toBe(420)
  })

  it('reports a card’s current balance as a positive amount owed', () => {
    const balance: RawBalance = { accountID: card.id, available: 8500, booked: -420, currencyCode: 'USD' }
    expect(adaptAccount(card, balance).balances.current).toBe(420)
  })
})
