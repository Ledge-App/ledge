import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SignJWT } from 'jose'
import { generateKeyPairSync } from 'node:crypto'

describe('verifyJwt — HS256 (legacy shared secret)', () => {
  const secret = 'test-supabase-jwt-secret'
  const secretKey = new TextEncoder().encode(secret)

  beforeEach(() => {
    vi.resetModules()
    process.env.SUPABASE_JWT_SECRET = secret
    process.env.SUPABASE_URL = 'https://unused-for-hs256.supabase.co'
  })

  it('extracts the user id from a valid Supabase JWT', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-abc-123')
      .sign(secretKey)
    await expect(verifyJwt(token)).resolves.toEqual({ userId: 'user-abc-123', email: null })
  })

  it('extracts the email claim when the token carries one', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = await new SignJWT({ email: 'dev@example.com' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-abc-123')
      .sign(secretKey)
    await expect(verifyJwt(token)).resolves.toEqual({ userId: 'user-abc-123', email: 'dev@example.com' })
  })

  it('rejects on an invalid signature', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-abc-123')
      .sign(new TextEncoder().encode('wrong-secret'))
    await expect(verifyJwt(token)).rejects.toThrow()
  })

  it('rejects on an expired token', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('user-abc-123')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(secretKey)
    await expect(verifyJwt(token)).rejects.toThrow()
  })
})

describe('verifyJwt — ES256 (JWKS signing keys)', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const kid = 'test-kid-1'

  beforeEach(() => {
    vi.resetModules()
    process.env.SUPABASE_URL = 'https://project-ref.supabase.co'
    vi.doMock('jose', async (importOriginal) => {
      const actual = await importOriginal<typeof import('jose')>()
      return {
        ...actual,
        createRemoteJWKSet: () => async (header: { kid?: string }) => {
          if (header.kid !== kid) {
            throw new Error('unknown kid')
          }
          return publicKey
        },
      }
    })
  })

  it('extracts the user id from a JWT signed with an ES256 signing key resolved via JWKS', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid })
      .setSubject('user-es256-1')
      .sign(privateKey)
    await expect(verifyJwt(token)).resolves.toEqual({ userId: 'user-es256-1', email: null })
  })

  it('extracts the email claim from an ES256 token', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = await new SignJWT({ email: 'dev@example.com' })
      .setProtectedHeader({ alg: 'ES256', kid })
      .setSubject('user-es256-1')
      .sign(privateKey)
    await expect(verifyJwt(token)).resolves.toEqual({ userId: 'user-es256-1', email: 'dev@example.com' })
  })

  it('rejects a token signed with a key not found in the JWKS', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: 'some-other-kid' })
      .setSubject('user-es256-2')
      .sign(privateKey)
    await expect(verifyJwt(token)).rejects.toThrow()
  })

  it('rejects an ES256 token whose signature does not match the resolved public key', async () => {
    const { privateKey: otherPrivateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const { verifyJwt } = await import('./requireAuth.js')
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid })
      .setSubject('user-es256-3')
      .sign(otherPrivateKey)
    await expect(verifyJwt(token)).rejects.toThrow()
  })
})
