import { describe, expect, it } from 'vitest'
import { ALL_PFC_DETAILED_CODES, DEFAULT_PFC_MAPPING } from './pfc.js'

describe('pfc taxonomy', () => {
  it('assigns every detailed code to exactly one default Ledge category', () => {
    const seen = new Map<string, string>()
    for (const entry of DEFAULT_PFC_MAPPING) {
      for (const code of entry.detailedCodes) {
        expect(seen.has(code)).toBe(false)
        seen.set(code, entry.ledgeCategory)
      }
    }
    expect(seen.size).toBe(ALL_PFC_DETAILED_CODES.length)
  })

  it('covers every code declared in ALL_PFC_DETAILED_CODES', () => {
    const mapped = new Set(DEFAULT_PFC_MAPPING.flatMap((e) => e.detailedCodes))
    for (const code of ALL_PFC_DETAILED_CODES) {
      expect(mapped.has(code)).toBe(true)
    }
  })

  it('includes the Food & Drink category with its documented codes', () => {
    const foodAndDrink = DEFAULT_PFC_MAPPING.find((e) => e.ledgeCategory === 'Food & Drink')
    expect(foodAndDrink?.detailedCodes).toEqual(
      expect.arrayContaining([
        'FOOD_AND_DRINK_RESTAURANTS',
        'FOOD_AND_DRINK_FAST_FOOD',
        'FOOD_AND_DRINK_GROCERIES',
        'FOOD_AND_DRINK_COFFEE',
        'FOOD_AND_DRINK_ALCOHOL_AND_BARS',
        'FOOD_AND_DRINK_FOOD_DELIVERY_SERVICES',
      ]),
    )
  })
})
