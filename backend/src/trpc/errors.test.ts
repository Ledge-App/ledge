import { describe, expect, it } from 'vitest'
import { notFoundError, preconditionError } from './errors.js'
import { REDACTED_MESSAGE, redactInternalMessage } from './errorLogging.js'

describe('user-facing errors', () => {
  it('keeps its message when the response shape is built', () => {
    for (const error of [preconditionError('Connect a Plaid account first.'), notFoundError('No such connection.')]) {
      const shape = { message: error.message, code: -32600, data: {} }
      // The round trip that matters: a typed error's message is what the app shows the user, so
      // it must not be caught by the internal-error redaction.
      expect(redactInternalMessage(shape, error.code).message).toBe(error.message)
    }
  })

  it('contrasts with an untyped throw, whose message is replaced', () => {
    const shape = { message: 'relation "transfers" does not exist', code: -32603, data: {} }
    expect(redactInternalMessage(shape, 'INTERNAL_SERVER_ERROR').message).toBe(REDACTED_MESSAGE)
  })

  it('uses codes that map to distinguishable HTTP statuses', () => {
    expect(preconditionError('x').code).toBe('PRECONDITION_FAILED')
    expect(notFoundError('x').code).toBe('NOT_FOUND')
  })
})
