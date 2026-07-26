import { beforeAll, describe, expect, it } from 'vitest'
import { decrypt, encrypt } from './aes.js'

beforeAll(() => {
  process.env.ACCESS_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64) // 32 bytes hex
})

describe('aes', () => {
  it('encrypts and decrypts back to the original plaintext', () => {
    const plaintext = 'sk_live_super_secret_plaid_key'
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toBe(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('produces different ciphertext for the same plaintext each call (random IV)', () => {
    const a = encrypt('same-input')
    const b = encrypt('same-input')
    expect(a).not.toBe(b)
  })

  it('throws on tampered ciphertext', () => {
    const ciphertext = encrypt('tamper-me')
    const tampered = ciphertext.slice(0, -2) + 'zz'
    expect(() => decrypt(tampered)).toThrow()
  })
})
