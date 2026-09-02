import { describe, expect, it } from 'vitest'
import { planWindowedMerge } from './planWindowedMerge'
import type { AdaptedTransaction } from './adaptTransaction'

function txn(id: string, date: string, amount = 10, transactionDate?: string): AdaptedTransaction {
  return {
    transaction_id: id,
    transactionDate: transactionDate ?? `${date}T00:00:00.000Z`,
    account_id: 'acc-1',
    name: id,
    original_description: null,
    merchant_name: null,
    mcc: null,
    amount,
    iso_currency_code: 'USD',
    date,
    pending: false,
    personal_finance_category: null,
  }
}

describe('planWindowedMerge', () => {
  it('keeps cached rows older than the window untouched', () => {
    const result = planWindowedMerge([txn('old', '2026-01-01')], [], '2026-08-01')
    expect(result.map((t) => t.transaction_id)).toEqual(['old'])
  })

  it('replaces in-window rows with what the window read returned', () => {
    const result = planWindowedMerge([txn('a', '2026-08-10', 10)], [txn('a', '2026-08-10', 42)], '2026-08-01')
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(42)
  })

  it('drops an in-window cached row the window read no longer reports', () => {
    const result = planWindowedMerge(
      [txn('gone', '2026-08-10'), txn('kept', '2026-08-11')],
      [txn('kept', '2026-08-11')],
      '2026-08-01',
    )
    expect(result.map((t) => t.transaction_id)).toEqual(['kept'])
  })

  it('adds rows the window read newly reports', () => {
    const result = planWindowedMerge([], [txn('new', '2026-08-12')], '2026-08-01')
    expect(result.map((t) => t.transaction_id)).toEqual(['new'])
  })

  it('sorts the result by date descending', () => {
    const result = planWindowedMerge([txn('oldest', '2026-01-01')], [txn('mid', '2026-08-05'), txn('newest', '2026-08-20')], '2026-08-01')
    expect(result.map((t) => t.transaction_id)).toEqual(['newest', 'mid', 'oldest'])
  })

  it('is idempotent, so repeated syncs of the same window cannot duplicate rows', () => {
    const once = planWindowedMerge([], [txn('a', '2026-08-10')], '2026-08-01')
    const twice = planWindowedMerge(once, [txn('a', '2026-08-10')], '2026-08-01')
    expect(twice).toEqual(once)
  })

  it('treats a null window start as a full replacement, for the first sync after a re-grant', () => {
    const result = planWindowedMerge([txn('stale', '2026-01-01')], [txn('fresh', '2026-08-10')], null)
    expect(result.map((t) => t.transaction_id)).toEqual(['fresh'])
  })

  it('keeps a charge authorized before the window but posted inside it', () => {
    // The fetch filters on transactionDate, so this row is not in `fetched`. Partitioning the cache
    // on `date` (the posted date) would place it in neither half and silently drop it.
    const straddling = txn('straddling', '2026-08-03', 10, '2026-07-28T00:00:00.000Z')
    const result = planWindowedMerge([straddling], [], '2026-08-01T00:00:00.000Z')
    expect(result.map((t) => t.transaction_id)).toEqual(['straddling'])
  })
})
