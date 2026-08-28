import { describe, expect, it } from 'vitest'
import { isRateLimitError, plaidErrorOf, plaidItemErrorDetail } from './errors.js'

describe('plaidErrorOf', () => {
  it('reads error_type and error_code out of the Plaid response body', () => {
    const err = Object.assign(new Error('too many'), {
      response: { data: { error_type: 'RATE_LIMIT_EXCEEDED', error_code: 'TRANSACTIONS_LIMIT' } },
    })
    expect(plaidErrorOf(err)).toEqual({
      errorType: 'RATE_LIMIT_EXCEEDED',
      errorCode: 'TRANSACTIONS_LIMIT',
      errorMessage: undefined,
    })
  })

  it('returns an empty detail for errors that carry no Plaid body', () => {
    const empty = { errorType: undefined, errorCode: undefined, errorMessage: undefined }
    expect(plaidErrorOf(new Error('network down'))).toEqual(empty)
    expect(plaidErrorOf(undefined)).toEqual(empty)
    expect(plaidErrorOf({ response: {} })).toEqual(empty)
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

describe('plaidItemErrorDetail', () => {
  it('reports Plaid\'s code and message rather than the axios status string', () => {
    const err = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        data: {
          error_type: 'ITEM_ERROR',
          error_code: 'ITEM_LOGIN_REQUIRED',
          error_message: 'the login details of this item have changed',
        },
      },
    })
    expect(plaidItemErrorDetail(err, 'fallback')).toEqual({
      message: 'the login details of this item have changed',
      errorCode: 'ITEM_LOGIN_REQUIRED',
    })
  })

  it('falls back to the error message when the failure never reached Plaid', () => {
    // A timeout or DNS failure has no response body, so there is no code to act on.
    expect(plaidItemErrorDetail(new Error('socket hang up'), 'fallback')).toEqual({ message: 'socket hang up' })
  })

  it('falls back to the caller\'s message for a non-Error rejection', () => {
    expect(plaidItemErrorDetail('nope', 'Could not load accounts.')).toEqual({ message: 'Could not load accounts.' })
  })
})
