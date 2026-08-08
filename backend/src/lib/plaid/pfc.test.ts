import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

  // Seeding writes these slugs straight into `categories.icon`, and the app resolves them against
  // frontend/assets/category-icons. A slug with no asset there is silent: every newly seeded user
  // gets the uncategorized fallback for that category, with nothing failing at seed time.
  it('names an icon asset that exists in the frontend', () => {
    const assetDir = fileURLToPath(new URL('../../../../frontend/assets/category-icons', import.meta.url))
    const assetSlugs = new Set(
      readdirSync(assetDir)
        .filter((f) => f.endsWith('.svg'))
        .map((f) => f.replace(/\.svg$/, '')),
    )
    for (const entry of DEFAULT_PFC_MAPPING) {
      expect(assetSlugs, `${entry.ledgeCategory} -> ${entry.icon}`).toContain(entry.icon)
    }
  })

  it('gives every entry a distinct Plaid primary, so the primary fallback is unambiguous', () => {
    const primaries = DEFAULT_PFC_MAPPING.map((e) => e.primary)
    expect(new Set(primaries).size).toBe(primaries.length)
  })

  // transactionRepository.sync pins the taxonomy to v2, and LOAN_DISBURSEMENTS is a primary that
  // exists only in v2. An unmapped primary can't be rescued by the client's primary fallback, so
  // these codes would go straight to Uncategorized if this entry were dropped.
  it('maps the LOAN_DISBURSEMENTS primary that PFCv2 introduced', () => {
    const entry = DEFAULT_PFC_MAPPING.find((e) => e.primary === 'LOAN_DISBURSEMENTS')
    expect(entry).toBeDefined()
    expect(entry?.detailedCodes).toContain('LOAN_DISBURSEMENTS_STUDENT')
  })

  // Plaid's taxonomy has no peer-to-peer code in v1 or v2; two invented ones were mapped here
  // until the v2 pin. Venmo/Zelle to a person arrives as *_ACCOUNT_TRANSFER instead.
  it('maps no peer-to-peer code, which Plaid does not define', () => {
    expect(ALL_PFC_DETAILED_CODES.filter((c) => c.includes('PEER_TO_PEER'))).toEqual([])
  })

  // v2 renamed three codes rather than adding them. Both spellings must stay mapped: sync is
  // pinned to v2, but transactions cached in MMKV before the pin still carry the v1 code, and the
  // client resolves categories from whatever the cached row says.
  it('maps both the v1 and v2 spelling of every renamed code', () => {
    const byCode = new Map<string, string>()
    for (const entry of DEFAULT_PFC_MAPPING) {
      for (const code of entry.detailedCodes) byCode.set(code, entry.ledgeCategory)
    }

    const renames: Array<[v1: string, v2: string]> = [
      ['INCOME_WAGES', 'INCOME_SALARY'],
      ['INCOME_OTHER_INCOME', 'INCOME_OTHER'],
      ['TRANSFER_IN_CASH_ADVANCES_AND_LOANS', 'LOAN_DISBURSEMENTS_OTHER_DISBURSEMENT'],
    ]

    for (const [v1, v2] of renames) {
      expect(byCode.has(v1), `${v1} unmapped`).toBe(true)
      expect(byCode.has(v2), `${v2} unmapped`).toBe(true)
      // Same real-world event, so the same Ledge category regardless of which version named it.
      expect(byCode.get(v1)).toBe(byCode.get(v2))
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
