import { describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import { verifyJwt } from './requireAuth.js'

describe('verifyJwt', () => {
  const secret = 'test-supabase-jwt-secret'

  it('extracts the user id from a valid Supabase JWT', () => {
    process.env.SUPABASE_JWT_SECRET = secret
    const token = jwt.sign({ sub: 'user-abc-123', role: 'authenticated' }, secret)
    expect(verifyJwt(token)).toEqual({ userId: 'user-abc-123' })
  })

  it('throws on an invalid signature', () => {
    process.env.SUPABASE_JWT_SECRET = secret
    const token = jwt.sign({ sub: 'user-abc-123' }, 'wrong-secret')
    expect(() => verifyJwt(token)).toThrow()
  })

  it('throws on an expired token', () => {
    process.env.SUPABASE_JWT_SECRET = secret
    const token = jwt.sign({ sub: 'user-abc-123' }, secret, { expiresIn: -10 })
    expect(() => verifyJwt(token)).toThrow()
  })
})
