import { describe, expect, it, vi } from 'vitest'
import { investmentRepository, MAX_INVESTMENT_PAGES } from './investmentRepository.js'
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

describe('investmentRepository.getTransactions', () => {
  it('keeps cash transfers and drops trades, mapping to camelCase', async () => {
    const investmentsTransactionsGet = vi.fn().mockResolvedValue({
      data: {
        investment_transactions: [
          {
            investment_transaction_id: 'itx-1',
            account_id: 'acc-ira',
            // A genuine external transfer names no security — that is what separates it from a
            // corporate action Plaid also types as cash/deposit.
            security_id: null,
            date: '2026-02-03',
            name: 'ACH Deposit',
            amount: -1000,
            quantity: 0,
            price: 0,
            fees: null,
            type: 'cash',
            subtype: 'contribution',
          },
          {
            investment_transaction_id: 'itx-2',
            account_id: 'acc-ira',
            security_id: 'sec-unknown',
            date: '2026-02-04',
            name: 'BUY VTI',
            amount: 1000,
            quantity: 4,
            price: 250,
            fees: 0,
            type: 'buy',
            subtype: 'buy',
          },
        ],
        securities: [
          { security_id: 'sec-vti', name: 'Vanguard Total Stock Market ETF', ticker_symbol: 'VTI' },
        ],
        total_investment_transactions: 2,
      },
    })
    const client = { investmentsTransactionsGet } as unknown as PlaidApi

    const transactions = await investmentRepository.getTransactions(client, 'token-1', '2024-08-08', '2026-08-08')

    expect(investmentsTransactionsGet).toHaveBeenCalledWith({
      access_token: 'token-1',
      start_date: '2024-08-08',
      end_date: '2026-08-08',
      options: { count: 500, offset: 0 },
    })
    // The buy is dropped at the source: it never crosses the wire, so no downstream code can
    // mistake its traded amount for spending. Only the contribution survives, and it carries no
    // security fields — a cash transfer has no security to join against.
    expect(transactions).toEqual([
      {
        investmentTransactionId: 'itx-1',
        accountId: 'acc-ira',
        date: '2026-02-03',
        name: 'ACH Deposit',
        amount: -1000,
        subtype: 'contribution',
      },
    ])
  })

  it('drops every non-transfer subtype, and keeps every transfer one', async () => {
    const row = (id: string, type: string, subtype: string) => ({
      investment_transaction_id: id,
      account_id: 'acc-ira',
      security_id: null,
      date: '2026-02-03',
      name: id,
      amount: -1,
      type,
      subtype,
    })
    const investmentsTransactionsGet = vi.fn().mockResolvedValue({
      data: {
        investment_transactions: [
          row('keep-contribution', 'cash', 'contribution'),
          row('keep-deposit', 'cash', 'deposit'),
          row('keep-withdrawal', 'cash', 'withdrawal'),
          row('keep-distribution', 'cash', 'distribution'),
          row('keep-transfer', 'cash', 'transfer'),
          // Casing varies by institution; the filter lowercases both sides.
          row('keep-upper', 'CASH', 'Contribution'),
          row('drop-buy', 'buy', 'buy'),
          row('drop-sell', 'sell', 'sell'),
          row('drop-fee', 'fee', 'account fee'),
          row('drop-cancel', 'cancel', 'buy'),
          // Dividends and interest are real income, but have no counterpart to pair against.
          row('drop-dividend', 'cash', 'dividend'),
          row('drop-interest', 'cash', 'interest'),
          // A share transfer is type 'transfer', not cash — the type gate catches it even though
          // its subtype is on the whitelist.
          row('drop-share-transfer', 'transfer', 'transfer'),
          // An unrecognised future subtype is dropped: money stays counted, the safe direction.
          row('drop-unknown', 'cash', 'some future subtype'),
        ],
        securities: [],
        total_investment_transactions: 14,
      },
    })
    const client = { investmentsTransactionsGet } as unknown as PlaidApi

    const transactions = await investmentRepository.getTransactions(client, 'token-1', '2024-08-08', '2026-08-08')

    expect(transactions.map((t) => t.investmentTransactionId)).toEqual([
      'keep-contribution',
      'keep-deposit',
      'keep-withdrawal',
      'keep-distribution',
      'keep-transfer',
      'keep-upper',
    ])
  })

  it('drops a security-linked corporate action even though its subtype is whitelisted', async () => {
    // Plaid types a distribution, spinoff or settling sale proceeds as cash/deposit, so the
    // subtype whitelist alone lets them through — "CROWDSTRIKE HLDGS INC CL A - DIST" showed up
    // in the transfers list looking exactly like an external deposit. It is money appearing
    // INSIDE the brokerage with no counterpart in any linked account. security_id is the signal:
    // a genuine external transfer names no security.
    const investmentsTransactionsGet = vi.fn().mockResolvedValue({
      data: {
        investment_transactions: [
          {
            investment_transaction_id: 'itx-dist',
            account_id: 'acc-ira',
            security_id: 'sec-crwd',
            date: '2026-07-02',
            name: 'CROWDSTRIKE HLDGS INC CL A - DISTRIBUTION',
            amount: -4073.58,
            type: 'cash',
            subtype: 'deposit',
          },
          {
            investment_transaction_id: 'itx-eft',
            account_id: 'acc-ira',
            security_id: null,
            date: '2026-06-11',
            name: 'Electronic Funds Transfer Received (Cash)',
            amount: -2000,
            type: 'cash',
            subtype: 'deposit',
          },
        ],
        securities: [],
        total_investment_transactions: 2,
      },
    })
    const client = { investmentsTransactionsGet } as unknown as PlaidApi

    const transactions = await investmentRepository.getTransactions(client, 'token-1', '2024-08-08', '2026-08-08')

    expect(transactions.map((t) => t.investmentTransactionId)).toEqual(['itx-eft'])
  })

  it('advances the paging offset by rows RETURNED, not rows kept', async () => {
    // Offsetting by the filtered length would re-request everything a page dropped; on an account
    // that trades heavily the drain would never advance past its first page.
    const tradePage = {
      data: {
        investment_transactions: Array.from({ length: 3 }, (_, i) => ({
          investment_transaction_id: `buy-${i}`,
          account_id: 'acc-ira',
          security_id: null,
          date: '2026-02-03',
          name: 'BUY',
          amount: 100,
          type: 'buy',
          subtype: 'buy',
        })),
        securities: [],
        total_investment_transactions: 4,
      },
    }
    const cashPage = {
      data: {
        investment_transactions: [
          {
            investment_transaction_id: 'itx-cash',
            account_id: 'acc-ira',
            security_id: null,
            date: '2026-02-04',
            name: 'ACH Deposit',
            amount: -500,
            type: 'cash',
            subtype: 'contribution',
          },
        ],
        securities: [],
        total_investment_transactions: 4,
      },
    }
    const investmentsTransactionsGet = vi.fn().mockResolvedValueOnce(tradePage).mockResolvedValueOnce(cashPage)
    const client = { investmentsTransactionsGet } as unknown as PlaidApi

    const transactions = await investmentRepository.getTransactions(client, 'token-1', '2024-08-08', '2026-08-08')

    // Second call offsets by 3 (rows returned), not 0 (rows kept).
    expect(investmentsTransactionsGet).toHaveBeenLastCalledWith({
      access_token: 'token-1',
      start_date: '2024-08-08',
      end_date: '2026-08-08',
      options: { count: 500, offset: 3 },
    })
    expect(transactions.map((t) => t.investmentTransactionId)).toEqual(['itx-cash'])
  })

  it('pages by offset until total_investment_transactions is reached', async () => {
    const page = (ids: string[], total: number) => ({
      data: {
        investment_transactions: ids.map((id) => ({
          investment_transaction_id: id,
          account_id: 'acc-ira',
          security_id: null,
          date: '2026-02-03',
          name: 'ACH Deposit',
          amount: -5,
          type: 'cash',
          subtype: 'contribution',
        })),
        securities: [],
        total_investment_transactions: total,
      },
    })
    const investmentsTransactionsGet = vi
      .fn()
      .mockResolvedValueOnce(page(['a'], 3))
      .mockResolvedValueOnce(page(['b'], 3))
      .mockResolvedValueOnce(page(['c'], 3))
    const client = { investmentsTransactionsGet } as unknown as PlaidApi

    const transactions = await investmentRepository.getTransactions(client, 'token-1', '2024-08-08', '2026-08-08')

    expect(investmentsTransactionsGet).toHaveBeenCalledTimes(3)
    expect(investmentsTransactionsGet).toHaveBeenLastCalledWith({
      access_token: 'token-1',
      start_date: '2024-08-08',
      end_date: '2026-08-08',
      options: { count: 500, offset: 2 },
    })
    expect(transactions.map((t) => t.investmentTransactionId)).toEqual(['a', 'b', 'c'])
  })

  it('stops at MAX_INVESTMENT_PAGES so one item cannot run the request into a timeout', async () => {
    // total is far beyond what MAX_INVESTMENT_PAGES pages can drain; the loop must still end.
    const investmentsTransactionsGet = vi.fn().mockResolvedValue({
      data: {
        investment_transactions: [
          {
            investment_transaction_id: 'itx-x',
            account_id: 'acc-ira',
            security_id: null,
            date: '2026-02-03',
            name: 'ACH Deposit',
            amount: -5,
            type: 'cash',
            subtype: 'contribution',
          },
        ],
        securities: [],
        total_investment_transactions: 999_999,
      },
    })
    const client = { investmentsTransactionsGet } as unknown as PlaidApi

    await investmentRepository.getTransactions(client, 'token-1', '2024-08-08', '2026-08-08')

    expect(investmentsTransactionsGet).toHaveBeenCalledTimes(MAX_INVESTMENT_PAGES)
  })

  it('stops when a page comes back empty even if total over-reports', async () => {
    const investmentsTransactionsGet = vi.fn().mockResolvedValue({
      data: { investment_transactions: [], securities: [], total_investment_transactions: 50 },
    })
    const client = { investmentsTransactionsGet } as unknown as PlaidApi

    const transactions = await investmentRepository.getTransactions(client, 'token-1', '2024-08-08', '2026-08-08')

    expect(investmentsTransactionsGet).toHaveBeenCalledTimes(1)
    expect(transactions).toEqual([])
  })
})
