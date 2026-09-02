import { describe, expect, it } from 'vitest'
import { mccToPfc } from './mccToPfc'

describe('mccToPfc', () => {
  it('maps an explicitly listed MCC to its PFC primary and detailed code', () => {
    expect(mccToPfc('5814')).toEqual({
      pfcPrimary: 'FOOD_AND_DRINK',
      pfcDetailed: 'FOOD_AND_DRINK_FAST_FOOD',
    })
  })

  it('returns nulls when the transaction carries no MCC', () => {
    expect(mccToPfc(null)).toEqual({ pfcPrimary: null, pfcDetailed: null })
  })

  it('resolves an MCC that only a range rule covers', () => {
    expect(mccToPfc('3011')).toEqual({
      pfcPrimary: 'TRAVEL',
      pfcDetailed: 'TRAVEL_FLIGHTS',
    })
  })

  it('prefers an explicit entry over the range rule containing it', () => {
    expect(mccToPfc('4111')).toEqual({
      pfcPrimary: 'TRANSPORTATION',
      pfcDetailed: 'TRANSPORTATION_PUBLIC_TRANSIT',
    })
  })

  it('falls back to the range rule for codes it does not list explicitly', () => {
    expect(mccToPfc('4789')).toEqual({
      pfcPrimary: 'TRANSPORTATION',
      pfcDetailed: 'TRANSPORTATION_OTHER_TRANSPORTATION',
    })
  })

  it('returns nulls for an MCC it cannot classify', () => {
    expect(mccToPfc('9999')).toEqual({ pfcPrimary: null, pfcDetailed: null })
  })
})
