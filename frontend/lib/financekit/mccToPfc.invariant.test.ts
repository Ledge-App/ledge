import { describe, expect, it } from 'vitest'
import { DEFAULT_PFC_MAPPING } from '../../../backend/src/lib/plaid/pfc'
import { EMITTED_PFC_DETAILED_CODES, mccToPfc } from './mccToPfc'

// A value import from backend/, not a type-only one. Safe in a test: the workflow already runs
// `npm ci --prefix ../backend` before `npm test`, and nothing here reaches the app bundle.
const CATEGORY_BY_DETAILED = new Map(
  DEFAULT_PFC_MAPPING.flatMap((entry) => entry.detailedCodes.map((code) => [code, entry])),
)

describe('mccToPfc stays inside Plaid’s taxonomy', () => {
  it('only emits detailed codes that DEFAULT_PFC_MAPPING assigns to a category', () => {
    const unknown = EMITTED_PFC_DETAILED_CODES.filter((code) => !CATEGORY_BY_DETAILED.has(code))
    expect(unknown).toEqual([])
  })

  it('derives the same primary DEFAULT_PFC_MAPPING files each emitted code under', () => {
    const mismatched = EMITTED_PFC_DETAILED_CODES.flatMap((detailed) => {
      const expected = CATEGORY_BY_DETAILED.get(detailed)?.primary
      const mcc = Object.entries(MCC_BY_DETAILED).find(([, d]) => d === detailed)?.[0]
      if (!mcc || !expected) return []
      const { pfcPrimary } = mccToPfc(mcc)
      return pfcPrimary === expected ? [] : [{ detailed, derived: pfcPrimary, expected }]
    })
    expect(mismatched).toEqual([])
  })
})

// Reverse index so the test can drive mccToPfc through its public API for every emitted code,
// rather than asserting against the table's internals.
const MCC_BY_DETAILED: Record<string, string> = Object.fromEntries(
  EMITTED_PFC_DETAILED_CODES.map((detailed) => {
    for (let code = 0; code <= 9999; code++) {
      const mcc = String(code).padStart(4, '0')
      if (mccToPfc(mcc).pfcDetailed === detailed) return [mcc, detailed]
    }
    return ['', detailed]
  }).filter(([mcc]) => mcc !== ''),
)
