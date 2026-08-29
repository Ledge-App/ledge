import { describe, expect, it } from 'vitest'
import { supabaseErrorOf } from './errors.js'

describe('supabaseErrorOf', () => {
  it('matches a dropped direct-Postgres connection by its Node error code', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' })
    expect(supabaseErrorOf(err)).toEqual({ matched: true, reason: 'ECONNREFUSED' })
  })

  it('matches every known network error code', () => {
    for (const code of ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN', 'EPIPE']) {
      expect(supabaseErrorOf(Object.assign(new Error('x'), { code }))).toEqual({ matched: true, reason: code })
    }
  })

  it('matches a PostgREST fetch failure by message, since it carries no network error code', () => {
    expect(supabaseErrorOf(new Error('fetch failed'))).toEqual({ matched: true, reason: 'fetch failed' })
    expect(supabaseErrorOf(new Error('The network connection was lost.'))).toEqual({
      matched: true,
      reason: 'The network connection was lost.',
    })
  })

  it('does not match an application-level Postgres/PostgREST error', () => {
    // A real bug: a unique-violation or an RLS rejection completed the round trip and got a
    // proper answer back — tagging this as "Supabase is down" would hide our own defect.
    const constraintViolation = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    })
    expect(supabaseErrorOf(constraintViolation)).toEqual({ matched: false })

    const rlsRejection = { message: 'new row violates row-level security policy', code: '42501' }
    expect(supabaseErrorOf(rlsRejection)).toEqual({ matched: false })
  })

  it('does not match a non-error value or one with no message', () => {
    expect(supabaseErrorOf(undefined)).toEqual({ matched: false })
    expect(supabaseErrorOf('nope')).toEqual({ matched: false })
    expect(supabaseErrorOf({})).toEqual({ matched: false })
  })
})
