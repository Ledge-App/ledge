import { describe, expect, it } from 'vitest'
import { UNCATEGORIZED_ID, computeDonutSegments } from './visualizationData'
import type { FeedItem } from './resolveFeed'

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

const categories = [
  { id: 'food', name: 'Food', icon: '🍜', color: '#F00' },
  { id: 'rent', name: 'Rent', icon: '🏠', color: '#0F0' },
]

describe('computeDonutSegments', () => {
  // The donut draws each segment as its percentage of the ring. Anything left out of the
  // segment list shows up as a gap in what should be a closed circle.
  it('covers the whole total when some spend is uncategorized', () => {
    const feed = [
      item({ id: 'a', amount: 60, date: '2026-08-01', categoryId: 'food' }),
      item({ id: 'b', amount: 40, date: '2026-08-02' }),
    ]
    const segments = computeDonutSegments(feed, new Map([['food', 60]]), categories, 100, 'expense')

    expect(segments.reduce((sum, s) => sum + s.percentage, 0)).toBeCloseTo(100)
    expect(segments.find((s) => s.categoryId === UNCATEGORIZED_ID)?.amount).toBe(40)
  })

  it('covers the whole total when every transaction is categorized', () => {
    const feed = [
      item({ id: 'a', amount: 60, date: '2026-08-01', categoryId: 'food' }),
      item({ id: 'b', amount: 40, date: '2026-08-02', categoryId: 'rent' }),
    ]
    const segments = computeDonutSegments(
      feed,
      new Map([['food', 60], ['rent', 40]]),
      categories,
      100,
      'expense',
    )

    expect(segments.reduce((sum, s) => sum + s.percentage, 0)).toBeCloseTo(100)
    expect(segments.some((s) => s.categoryId === UNCATEGORIZED_ID)).toBe(false)
  })

  it('counts the transactions behind each segment', () => {
    const feed = [
      item({ id: 'a', amount: 30, date: '2026-08-01', categoryId: 'food' }),
      item({ id: 'b', amount: 30, date: '2026-08-02', categoryId: 'food' }),
      item({ id: 'c', amount: 40, date: '2026-08-03' }),
    ]
    const segments = computeDonutSegments(feed, new Map([['food', 60]]), categories, 100, 'expense')

    expect(segments.find((s) => s.categoryId === 'food')?.transactionCount).toBe(2)
    expect(segments.find((s) => s.categoryId === UNCATEGORIZED_ID)?.transactionCount).toBe(1)
  })

  it('returns nothing when the month has no spend', () => {
    expect(computeDonutSegments([], new Map(), categories, 0, 'expense')).toEqual([])
  })

  it('sorts largest first', () => {
    const feed = [
      item({ id: 'a', amount: 20, date: '2026-08-01', categoryId: 'food' }),
      item({ id: 'b', amount: 80, date: '2026-08-02', categoryId: 'rent' }),
    ]
    const segments = computeDonutSegments(
      feed,
      new Map([['food', 20], ['rent', 80]]),
      categories,
      100,
      'expense',
    )

    expect(segments.map((s) => s.categoryId)).toEqual(['rent', 'food'])
  })
})
