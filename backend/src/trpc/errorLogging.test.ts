import { describe, expect, it, vi } from 'vitest'
import { REDACTED_MESSAGE, logTrpcError, redactInternalMessage } from './errorLogging.js'

function fakeLog() {
  return { warn: vi.fn(), error: vi.fn() }
}

function trpcError(code: string, message: string, cause?: unknown) {
  return { code, message, name: 'TRPCError', stack: 'stack here', cause } as never
}

describe('logTrpcError', () => {
  it('logs an unexpected failure at error level with the procedure that failed', () => {
    const log = fakeLog()
    logTrpcError(log, { error: trpcError('INTERNAL_SERVER_ERROR', 'db is down'), path: 'accounts.list', type: 'query' })

    expect(log.error).toHaveBeenCalledTimes(1)
    expect(log.warn).not.toHaveBeenCalled()
    const [detail, message] = log.error.mock.calls[0]
    expect(message).toBe('trpc procedure failed')
    expect(detail.trpc).toEqual({ path: 'accounts.list', type: 'query', code: 'INTERNAL_SERVER_ERROR' })
    expect(detail.err).toBeDefined()
  })

  it('logs an expected rejection at warn level so real failures stay findable', () => {
    const log = fakeLog()
    // A signed-out client polling is normal traffic, not an incident.
    logTrpcError(log, { error: trpcError('UNAUTHORIZED', 'UNAUTHORIZED'), path: 'accounts.list', type: 'query' })

    expect(log.warn).toHaveBeenCalledTimes(1)
    expect(log.error).not.toHaveBeenCalled()
  })

  it('surfaces the Plaid error code from the cause, which the message never carries', () => {
    const log = fakeLog()
    // A failed Plaid call rejects with an axios error whose message is only
    // "Request failed with status code 400" — the diagnosis lives in the response body.
    const cause = Object.assign(new Error('Request failed with status code 400'), {
      response: { data: { error_type: 'ITEM_ERROR', error_code: 'ITEM_LOGIN_REQUIRED' } },
    })
    logTrpcError(log, {
      error: trpcError('INTERNAL_SERVER_ERROR', 'Request failed with status code 400', cause),
      path: 'transactions.sync',
      type: 'mutation',
    })

    expect(log.error.mock.calls[0][0].plaid).toEqual({ errorType: 'ITEM_ERROR', errorCode: 'ITEM_LOGIN_REQUIRED' })
  })

  it('omits the plaid field entirely when the cause is not a Plaid error', () => {
    const log = fakeLog()
    logTrpcError(log, { error: trpcError('INTERNAL_SERVER_ERROR', 'boom'), path: 'budgets.list', type: 'query' })
    expect(log.error.mock.calls[0][0].plaid).toBeUndefined()
  })

  it('never logs the procedure input', () => {
    const log = fakeLog()
    // Constraint 11: raw Plaid data must not be persisted server-side, and a log line is
    // persistence. Inputs carry cursors, amounts and transaction ids, so they stay out.
    logTrpcError(log, {
      error: trpcError('INTERNAL_SERVER_ERROR', 'boom'),
      path: 'transactions.sync',
      type: 'mutation',
      input: { cursors: { 'item-1': 'secret-cursor' } },
      userId: 'user-1',
    })

    const serialized = JSON.stringify(log.error.mock.calls[0][0])
    expect(serialized).not.toContain('secret-cursor')
    expect(serialized).not.toContain('cursors')
    // The user id is kept: an opaque uuid is what makes a report traceable, and it is not
    // financial data.
    expect(log.error.mock.calls[0][0].userId).toBe('user-1')
  })

  it('tolerates a request with no resolved path', () => {
    const log = fakeLog()
    logTrpcError(log, { error: trpcError('PARSE_ERROR', 'bad json'), type: 'unknown' })
    expect(log.error.mock.calls[0][0].trpc.path).toBe('<unknown>')
  })
})

describe('redactInternalMessage', () => {
  it('replaces an internal error message that would otherwise reach the client', () => {
    const shape = { message: 'could not reach db at 10.0.0.5:5432', code: -32603, data: { httpStatus: 500 } }
    expect(redactInternalMessage(shape, 'INTERNAL_SERVER_ERROR')).toEqual({ ...shape, message: REDACTED_MESSAGE })
  })

  it('leaves deliberate user-facing messages alone', () => {
    // Everything the app shows a user is thrown as a typed TRPCError precisely so it survives
    // this filter; anything untyped is a bug or a misconfiguration and says nothing useful.
    for (const code of ['BAD_REQUEST', 'NOT_FOUND', 'UNAUTHORIZED', 'PRECONDITION_FAILED']) {
      const shape = { message: 'Built-in categories cannot be renamed.', code: -32600, data: {} }
      expect(redactInternalMessage(shape, code).message).toBe('Built-in categories cannot be renamed.')
    }
  })
})
