import { beforeEach, describe, expect, it, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { generateKeyPairSync } from 'node:crypto'

describe('verifyJwt — HS256 (legacy shared secret)', () => {
  const secret = 'test-supabase-jwt-secret'

  beforeEach(() => {
    vi.resetModules()
    process.env.SUPABASE_JWT_SECRET = secret
    process.env.SUPABASE_URL = 'https://unused-for-hs256.supabase.co'
  })

  it('extracts the user id from a valid Supabase JWT', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = jwt.sign({ sub: 'user-abc-123', role: 'authenticated' }, secret, { algorithm: 'HS256' })
    await expect(verifyJwt(token)).resolves.toEqual({ userId: 'user-abc-123' })
  })

  it('rejects on an invalid signature', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = jwt.sign({ sub: 'user-abc-123' }, 'wrong-secret', { algorithm: 'HS256' })
    await expect(verifyJwt(token)).rejects.toThrow()
  })

  it('rejects on an expired token', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = jwt.sign({ sub: 'user-abc-123' }, secret, { algorithm: 'HS256', expiresIn: -10 })
    await expect(verifyJwt(token)).rejects.toThrow()
  })
})

describe('verifyJwt — ES256 (JWKS signing keys)', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const kid = 'test-kid-1'
  const jwk = publicKey.export({ format: 'jwk' })

  beforeEach(() => {
    vi.resetModules()
    vi.doMock('jwks-rsa', () => ({
      default: () => ({
        getSigningKey: (requestedKid: string, callback: (err: Error | null, key?: { getPublicKey: () => string }) => void) => {
          if (requestedKid !== kid) {
            callback(new Error('unknown kid'))
            return
          }
          callback(null, { getPublicKey: () => publicKey.export({ type: 'spki', format: 'pem' }) as string })
        },
      }),
    }))
  })

  it('extracts the user id from a JWT signed with an ES256 signing key resolved via JWKS', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = jwt.sign({ sub: 'user-es256-1' }, privateKey, { algorithm: 'ES256', keyid: kid })
    await expect(verifyJwt(token)).resolves.toEqual({ userId: 'user-es256-1' })
  })

  it('rejects a token signed with a key not found in the JWKS', async () => {
    const { verifyJwt } = await import('./requireAuth.js')
    const token = jwt.sign({ sub: 'user-es256-2' }, privateKey, { algorithm: 'ES256', keyid: 'some-other-kid' })
    await expect(verifyJwt(token)).rejects.toThrow()
  })

  it('rejects an ES256 token whose signature does not match the resolved public key', async () => {
    const { publicKey: otherPublicKey, privateKey: otherPrivateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    })
    void otherPublicKey
    const { verifyJwt } = await import('./requireAuth.js')
    const token = jwt.sign({ sub: 'user-es256-3' }, otherPrivateKey, { algorithm: 'ES256', keyid: kid })
    await expect(verifyJwt(token)).rejects.toThrow()
  })
})
