import { describe, expect, it } from 'vitest'
import { categorizationService } from './categorizationService.js'

describe('categorizationService.resolveCategory', () => {
  const mappings = [
    { id: 'm1', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: null, categoryId: 'cat-food' },
    { id: 'm2', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: 'cat-coffee' },
  ]

  it('prefers the detailed-code mapping over the primary-only mapping', () => {
    const result = categorizationService.resolveCategory(mappings, {
      primary: 'FOOD_AND_DRINK',
      detailed: 'FOOD_AND_DRINK_COFFEE',
    })
    expect(result).toEqual({ categoryId: 'cat-coffee' })
  })

  it('falls back to the primary-only mapping when no detailed mapping exists', () => {
    const result = categorizationService.resolveCategory(mappings, {
      primary: 'FOOD_AND_DRINK',
      detailed: 'FOOD_AND_DRINK_RESTAURANTS',
    })
    expect(result).toEqual({ categoryId: 'cat-food' })
  })

  it('returns null when no mapping matches at all', () => {
    const result = categorizationService.resolveCategory(mappings, { primary: 'TRAVEL', detailed: 'TRAVEL_FLIGHTS' })
    expect(result).toBeNull()
  })
})
