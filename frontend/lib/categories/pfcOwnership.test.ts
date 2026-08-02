import { describe, expect, it } from 'vitest'
import { resolvePfcOwnership } from './pfcOwnership'
import type { Category, PlaidCategoryMapping } from '@/types/domain'

const categories: Category[] = [
  { id: 'cat-food', name: 'Food & Drink', color: '#F97316', icon: '🍽' },
  { id: 'cat-transport', name: 'Transport', color: '#3B82F6', icon: '🚗' },
]

const mappings: PlaidCategoryMapping[] = [
  { id: 'm1', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: 'cat-food' },
  { id: 'm2', plaidPfcPrimary: 'TRANSPORTATION', plaidPfcDetailed: 'TRANSPORTATION_GAS', categoryId: 'cat-transport' },
]

describe('resolvePfcOwnership', () => {
  it('maps each claimed detailed PFC code to its owning category id and name', () => {
    const result = resolvePfcOwnership(mappings, categories)
    expect(result.get('FOOD_AND_DRINK_COFFEE')).toEqual({ categoryId: 'cat-food', categoryName: 'Food & Drink' })
    expect(result.get('TRANSPORTATION_GAS')).toEqual({ categoryId: 'cat-transport', categoryName: 'Transport' })
  })

  it('has no entry for an unclaimed code', () => {
    const result = resolvePfcOwnership(mappings, categories)
    expect(result.has('FOOD_AND_DRINK_GROCERIES')).toBe(false)
  })

  it('ignores a mapping whose category no longer exists', () => {
    const orphaned: PlaidCategoryMapping[] = [
      { id: 'm3', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_BARS', categoryId: 'cat-deleted' },
    ]
    const result = resolvePfcOwnership(orphaned, categories)
    expect(result.has('FOOD_AND_DRINK_BARS')).toBe(false)
  })
})
