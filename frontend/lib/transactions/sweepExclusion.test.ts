import { describe, expect, it } from 'vitest'
import { applySweepExclusion } from './sweepExclusion'
import { countsTowardTotals } from './totals'
import type { FeedItem } from './resolveFeed'

function item(overrides: Partial<FeedItem> & { id: string }): FeedItem {
  return {
    source: 'plaid',
    amount: 0,
    date: '2026-07-31',
    merchantName: 'Fidelity',
    categoryId: null,
    subcategoryId: null,
    categorySource: 'plaid_pfc',
    confidenceLevel: null,
    pfcDetailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
    accountId: 'cma',
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
    isBrokerageCashAccount: true,
    isSweptOutflow: false,
    hasCrossAccountCounterpart: false,
    links: [],
    ...overrides,
  }
}

function find(feed: FeedItem[], id: string) {
  return feed.find((i) => i.id === id)!
}

describe('applySweepExclusion', () => {
  // The Fidelity CMA case: every inflow is immediately swept into the fund, and Plaid reports
  // both legs on the same account — which autoMatch's pairAllowed rejects, so no transfer record
  // ever forms. Matching on exact amount within the account is what catches it.
  it('marks a sweep outflow that mirrors an inflow of the exact same amount', () => {
    const result = applySweepExclusion([
      item({ id: 'dividend', amount: -6.55, pfcDetailed: 'INCOME_DIVIDENDS' }),
      item({ id: 'sweep', amount: 6.55 }),
    ])

    expect(find(result, 'sweep').isSweptOutflow).toBe(true)
    // Asymmetric on purpose: the dividend is income the user really earned. Only the sweep goes.
    expect(find(result, 'dividend').isSweptOutflow).toBe(false)
  })

  it('leaves the income leg counted and drops only the expense from totals', () => {
    const result = applySweepExclusion([
      item({ id: 'dividend', amount: -6.55, pfcDetailed: 'INCOME_DIVIDENDS' }),
      item({ id: 'sweep', amount: 6.55 }),
    ])

    expect(countsTowardTotals(find(result, 'dividend'))).toBe(true)
    expect(countsTowardTotals(find(result, 'sweep'))).toBe(false)
  })

  // Window is 1 day, tighter than autoMatch's 7: a sweep is automatic and settles same-day or
  // overnight, and since this matches on amount alone every extra day is another chance to
  // swallow a real purchase that happens to equal a recent inflow.
  it('matches a sweep on the same day and one day later', () => {
    const sameDay = applySweepExclusion([
      item({ id: 'in', amount: -50, date: '2026-07-31', pfcDetailed: 'INCOME_DIVIDENDS' }),
      item({ id: 'out', amount: 50, date: '2026-07-31' }),
    ])
    expect(find(sameDay, 'out').isSweptOutflow).toBe(true)

    const nextDay = applySweepExclusion([
      item({ id: 'in', amount: -50, date: '2026-07-31', pfcDetailed: 'INCOME_DIVIDENDS' }),
      item({ id: 'out', amount: 50, date: '2026-08-01' }),
    ])
    expect(find(nextDay, 'out').isSweptOutflow).toBe(true)
  })

  it('does not match two days apart', () => {
    const result = applySweepExclusion([
      item({ id: 'in', amount: -50, date: '2026-07-31', pfcDetailed: 'INCOME_DIVIDENDS' }),
      item({ id: 'out', amount: 50, date: '2026-08-02' }),
    ])
    expect(find(result, 'out').isSweptOutflow).toBe(false)
  })

  it('requires the amounts to match exactly', () => {
    const result = applySweepExclusion([
      item({ id: 'in', amount: -6.55, pfcDetailed: 'INCOME_DIVIDENDS' }),
      item({ id: 'out', amount: 6.56 }),
    ])

    expect(find(result, 'out').isSweptOutflow).toBe(false)
  })

  // Runs last in the chain, so anything autoMatch already paired is off limits — re-deciding it
  // here could contradict a transfer the user confirmed or undid.
  it('skips an outflow that is already part of a transfer', () => {
    const result = applySweepExclusion([
      item({ id: 'in', amount: -500, pfcDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER' }),
      item({ id: 'out', amount: 500, transferId: 't1', transferKind: 'account_transfer', transferRole: 'expense' }),
    ])

    expect(find(result, 'out').isSweptOutflow).toBe(false)
  })

  // The inflow may legitimately already belong to a transfer (money arriving from linked
  // checking), and the sweep that follows it still needs excluding.
  it('still matches when the inflow leg belongs to a transfer', () => {
    const result = applySweepExclusion([
      item({ id: 'in', amount: -2033.45, pfcDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER', transferId: 't1', transferKind: 'account_transfer', transferRole: 'income' }),
      item({ id: 'sweep', amount: 2033.45 }),
    ])

    expect(find(result, 'sweep').isSweptOutflow).toBe(true)
  })

  it('does nothing on accounts that are not brokerage cash', () => {
    const result = applySweepExclusion([
      item({ id: 'in', amount: -500, accountId: 'checking', isBrokerageCashAccount: false, pfcDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER' }),
      item({ id: 'out', amount: 500, accountId: 'checking', isBrokerageCashAccount: false }),
    ])

    expect(find(result, 'out').isSweptOutflow).toBe(false)
  })

  it('only pairs legs on the same account', () => {
    const result = applySweepExclusion([
      item({ id: 'in', amount: -500, accountId: 'cma-a', pfcDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER' }),
      item({ id: 'out', amount: 500, accountId: 'cma-b' }),
    ])

    expect(find(result, 'out').isSweptOutflow).toBe(false)
  })

  // One inflow justifies dropping one outflow. Two equal sweeps against a single inflow would
  // otherwise both vanish and understate spending.
  it('consumes each inflow at most once', () => {
    const result = applySweepExclusion([
      item({ id: 'in', amount: -100, pfcDetailed: 'INCOME_DIVIDENDS' }),
      item({ id: 'out-1', amount: 100 }),
      item({ id: 'out-2', amount: 100 }),
    ])

    const marked = result.filter((i) => i.isSweptOutflow)
    expect(marked).toHaveLength(1)
  })

  it('handles the full Fidelity day: three inflows, three mirrored sweeps', () => {
    const result = applySweepExclusion([
      item({ id: 'div-1', amount: -6.55, pfcDetailed: 'INCOME_DIVIDENDS' }),
      item({ id: 'sweep-1', amount: 6.55 }),
      item({ id: 'div-2', amount: -14.78, pfcDetailed: 'INCOME_DIVIDENDS' }),
      item({ id: 'sweep-2', amount: 14.78 }),
      item({ id: 'transfer-in', amount: -2033.45, pfcDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER' }),
      item({ id: 'sweep-3', amount: 2033.45 }),
    ])

    const expenseTotal = result.filter((i) => i.amount > 0 && countsTowardTotals(i)).reduce((s, i) => s + i.amount, 0)
    expect(expenseTotal).toBe(0)
    // Income is untouched: 6.55 + 14.78 + 2033.45
    const incomeTotal = result.filter((i) => i.amount < 0 && countsTowardTotals(i)).reduce((s, i) => s + Math.abs(i.amount), 0)
    expect(incomeTotal).toBeCloseTo(2054.78, 2)
  })

  // A round trip through a linked bank: money leaves the brokerage cash account, comes back, then
  // leaves again for a second account, all at the same amount. The returning inflow mirrors the
  // second outflow on amount and date, but that outflow has its own counterpart sitting in a
  // linked account — it is a transfer autoMatch should pair, not a sweep.
  it('leaves an outflow alone when an equal inflow sits on another account', () => {
    const result = applySweepExclusion([
      item({ id: 'cma-in', amount: -5000, date: '2026-05-04', pfcDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER' }),
      item({ id: 'cma-out', amount: 5000, date: '2026-05-05' }),
      item({ id: 'bank2-in', amount: -5000, date: '2026-05-05', accountId: 'bank2', isBrokerageCashAccount: false, pfcDetailed: 'TRANSFER_IN_ACCOUNT_TRANSFER' }),
    ])

    expect(find(result, 'cma-out').isSweptOutflow).toBe(false)
  })

  // Outflows only. A brokerage-cash INFLOW tagged with an investment code is typically a
  // redemption out of the core money-market fund — genuinely an investment, and one that routinely
  // equals an unrelated outflow elsewhere, because the redemption exists to fund a transfer of
  // exactly that size. Stamping it turns a correct "Investment" label into a wrong "Internal" one.
  it('does not stamp an inflow, whatever sits on another account', () => {
    const result = applySweepExclusion([
      item({ id: 'cma-in', amount: -5000, date: '2026-05-04', pfcDetailed: 'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS' }),
      item({ id: 'bank-out', amount: 5000, date: '2026-05-04', accountId: 'bank', isBrokerageCashAccount: false }),
    ])

    expect(find(result, 'cma-in').hasCrossAccountCounterpart).toBe(false)
  })

  it('leaves an outflow with no matching inflow counted', () => {
    const result = applySweepExclusion([item({ id: 'out', amount: 42 })])
    expect(find(result, 'out').isSweptOutflow).toBe(false)
    expect(countsTowardTotals(find(result, 'out'))).toBe(true)
  })

  it('returns manual transactions untouched', () => {
    const result = applySweepExclusion([
      item({ id: 'in', amount: -20, pfcDetailed: 'INCOME_DIVIDENDS' }),
      item({ id: 'manual', amount: 20, source: 'manual', accountId: null, isBrokerageCashAccount: false, pfcDetailed: null }),
    ])

    expect(find(result, 'manual').isSweptOutflow).toBe(false)
  })

  it('leaves a newly auto-applied investment transfer alone', () => {
    // applySweepExclusion runs after applyTransfers; an outflow with a transferKind is off limits.
    const feed = [
      item({
        id: 'itx-out',
        accountId: 'acc-ira',
        isBrokerageCashAccount: true,
        amount: 1000,
        date: '2026-02-03',
        transferKind: 'account_transfer',
      }),
      item({ id: 'itx-in', accountId: 'acc-ira', isBrokerageCashAccount: true, amount: -1000, date: '2026-02-03' }),
    ]
    expect(applySweepExclusion(feed).find((i) => i.id === 'itx-out')!.isSweptOutflow).toBe(false)
  })
})

describe('applySweepExclusion: investment rows', () => {
  const investment = (overrides: Partial<FeedItem> & { id: string }): FeedItem =>
    item({ source: 'investment', accountId: 'acc-ira', pfcDetailed: null, ...overrides })

  it('lets a real cash inflow exclude the sweep that mirrors it', () => {
    // Only cash crossing the account boundary is ingested, so every investment row IS a genuine
    // sweep source — there is no trade activity left to wrongly seed this index.
    const deposit = investment({ id: 'itx-dep', amount: -75, date: '2026-03-11' })
    const sweep = item({ id: 'sweep-2', accountId: 'acc-ira', amount: 75, date: '2026-03-11' })

    const result = applySweepExclusion([deposit, sweep])

    expect(find(result, 'sweep-2').isSweptOutflow).toBe(true)
  })
})
