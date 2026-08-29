import { describe, expect, it } from 'vitest'
import { networkErrorOf } from './errors.js'

describe('networkErrorOf', () => {
  it('matches a dropped direct-Postgres connection by its Node error code', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })
    expect(networkErrorOf(err)).toEqual({ matched: true, reason: 'ECONNREFUSED' })
  })

  it('matches every known network error code', () => {
    for (const code of ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN', 'EPIPE']) {
      expect(networkErrorOf(Object.assign(new Error('x'), { code }))).toEqual({ matched: true, reason: code })
    }
  })

  it('matches a PostgREST fetch failure by message, since it carries no network error code', () => {
    expect(networkErrorOf(new Error('fetch failed'))).toEqual({ matched: true, reason: 'fetch failed' })
    expect(networkErrorOf(new Error('The network connection was lost.'))).toEqual({
      matched: true,
      reason: 'The network connection was lost.',
    })
  })

  it('does not match an application-level Postgres/PostgREST error', () => {
    // A real bug: a unique-violation or an RLS rejection completed the round trip and got a
    // proper answer back — tagging this as a network failure would hide our own defect.
    const constraintViolation = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    })
    expect(networkErrorOf(constraintViolation)).toEqual({ matched: false })

    const rlsRejection = { message: 'new row violates row-level security policy', code: '42501' }
    expect(networkErrorOf(rlsRejection)).toEqual({ matched: false })
  })

  it('does not match Postgres\'s own statement timeout, a slow query rather than a dropped connection', () => {
    // SQLSTATE 57014 — the query completed a full round trip and Postgres itself cancelled it.
    // The word "timeout" appears in the message, which is exactly why message-matching on it
    // was rejected in favor of the specific ETIMEDOUT error code.
    const statementTimeout = Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })
    expect(networkErrorOf(statementTimeout)).toEqual({ matched: false })
  })

  it('does not match on a bare substring of unrelated text', () => {
    // A prior version matched /network/i as a bare substring; a message that merely mentions
    // "network" without indicating a dropped connection must not be tagged as one.
    expect(networkErrorOf(new Error('user requested network access to a disabled feature'))).toEqual({ matched: false })
  })

  it('does not match a non-error value or one with no message', () => {
    expect(networkErrorOf(undefined)).toEqual({ matched: false })
    expect(networkErrorOf('nope')).toEqual({ matched: false })
    expect(networkErrorOf({})).toEqual({ matched: false })
  })
})
