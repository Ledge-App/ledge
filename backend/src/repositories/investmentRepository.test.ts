import { describe, expect, it, vi } from 'vitest'
import { investmentRepository } from './investmentRepository.js'
import type { PlaidApi } from 'plaid'

describe('investmentRepository.getHoldings', () => {
  it('joins holdings with their securities and maps to camelCase', async () => {
    const investmentsHoldingsGet = vi.fn().mockResolvedValue({
      data: {
        holdings: [
          {
            security_id: 'sec-vti',
            quantity: 12.5,
            institution_value: 3125.5,
            cost_basis: 2500,
            institution_price: 250.04,
            iso_currency_code: 'USD',
          },
          {
            security_id: 'sec-opt',
            quantity: 10000,
            institution_value: 110,
            cost_basis: 100,
            institution_price: 0.011,
            iso_currency_code: 'USD',
          },
          {
            security_id: 'sec-unknown',
            quantity: 1,
            institution_value: null,
            cost_basis: null,
            institution_price: null,
            iso_currency_code: null,
          },
        ],
        securities: [
          { security_id: 'sec-vti', name: 'Vanguard Total Stock Market ETF', ticker_symbol: 'VTI', type: 'etf', close_price: 248.0 },
          {
            security_id: 'sec-opt',
            name: 'NFLX Feb 2018 Call',
            ticker_symbol: 'NFLX180201C00355000',
            type: 'derivative',
            option_contract: { contract_type: 'call', strike_price: 355, underlying_security_ticker: 'NFLX' },
          },
        ],
      },
    })
    const client = { investmentsHoldingsGet } as unknown as PlaidApi

    const holdings = await investmentRepository.getHoldings(client, 'token-1', 'acc-ira')

    expect(investmentsHoldingsGet).toHaveBeenCalledWith({
      access_token: 'token-1',
      options: { account_ids: ['acc-ira'] },
    })
    expect(holdings).toEqual([
      {
        securityId: 'sec-vti',
        name: 'Vanguard Total Stock Market ETF',
        ticker: 'VTI',
        type: 'etf',
        quantity: 12.5,
        institutionValue: 3125.5,
        costBasis: 2500,
        institutionPrice: 250.04,
        closePrice: 248.0,
        optionContract: null,
        isoCurrencyCode: 'USD',
      },
      {
        securityId: 'sec-opt',
        name: 'NFLX Feb 2018 Call',
        ticker: 'NFLX180201C00355000',
        type: 'derivative',
        quantity: 10000,
        institutionValue: 110,
        costBasis: 100,
        institutionPrice: 0.011,
        closePrice: null,
        optionContract: { underlyingTicker: 'NFLX', contractType: 'call', strikePrice: 355 },
        isoCurrencyCode: 'USD',
      },
      // A holding whose security is missing from the catalog still comes through, unnamed.
      {
        securityId: 'sec-unknown',
        name: null,
        ticker: null,
        type: null,
        quantity: 1,
        institutionValue: null,
        costBasis: null,
        institutionPrice: null,
        closePrice: null,
        optionContract: null,
        isoCurrencyCode: null,
      },
    ])
  })
})
