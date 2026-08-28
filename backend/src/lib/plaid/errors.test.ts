import { describe, expect, it } from 'vitest'
import { isRateLimitError, plaidErrorOf } from './errors.js'

describe('plaidErrorOf', () => {
  it('reads error_type and error_code out of the Plaid response body', () => {
    const err = Object.assign(new Error('too many'), {
      response: { data: { error_type: 'RATE_LIMIT_EXCEEDED', error_code: 'TRANSACTIONS_LIMIT' } },
    })
    expect(plaidErrorOf(err)).toEqual({ errorType: 'RATE_LIMIT_EXCEEDED', errorCode: 'TRANSACTIONS_LIMIT' })
  })

  it('returns an empty detail for errors that carry no Plaid body', () => {
    expect(plaidErrorOf(new Error('network down'))).toEqual({ errorType: undefined, errorCode: undefined })
    expect(plaidErrorOf(undefined)).toEqual({ errorType: undefined, errorCode: undefined })
    expect(plaidErrorOf({ response: {} })).toEqual({ errorType: undefined, errorCode: undefined })
  })
})

describe('isRateLimitError', () => {
  it('matches every code in the RATE_LIMIT_EXCEEDED family', () => {
    for (const errorCode of ['RATE_LIMIT', 'TRANSACTIONS_LIMIT', 'ADDITION_LIMIT']) {
      const err = { response: { data: { error_type: 'RATE_LIMIT_EXCEEDED', error_code: errorCode } } }
      expect(isRateLimitError(err)).toBe(true)
    }
  })

  it('does not match other Plaid error types or bare errors', () => {
    const itemError = { response: { data: { error_type: 'ITEM_ERROR', error_code: 'ITEM_LOGIN_REQUIRED' } } }
    expect(isRateLimitError(itemError)).toBe(false)
    // A plain Error whose message merely mentions a limit must not be mistaken for a 429.
    expect(isRateLimitError(new Error('RATE_LIMIT'))).toBe(false)
  })
})
