import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMock = {
  insert: vi.fn(),
  select: vi.fn(),
}
vi.mock('../lib/db/client.js', () => ({ db: dbMock }))
vi.mock('../lib/crypto/aes.js', () => ({
  encrypt: vi.fn((s: string) => `enc(${s})`),
  decrypt: vi.fn((s: string) => s.replace(/^enc\(|\)$/g, '')),
}))

describe('plaidCredentialRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('encrypts the secret before upserting', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    dbMock.insert.mockReturnValue({ values })

    const { plaidCredentialRepository } = await import('./plaidCredentialRepository.js')
    await plaidCredentialRepository.upsert({
      userId: 'user-1',
      clientId: 'client-abc',
      secret: 'plaintext-secret',
      environment: 'sandbox',
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        clientId: 'client-abc',
        encryptedSecret: 'enc(plaintext-secret)',
        environment: 'sandbox',
      }),
    )
  })

  it('returns decrypted credentials for a user', async () => {
    const where = vi.fn().mockResolvedValue([
      { clientId: 'client-abc', encryptedSecret: 'enc(plaintext-secret)', environment: 'sandbox' },
    ])
    const from = vi.fn(() => ({ where }))
    dbMock.select.mockReturnValue({ from })

    const { plaidCredentialRepository } = await import('./plaidCredentialRepository.js')
    const result = await plaidCredentialRepository.getDecrypted('user-1')

    expect(result).toEqual({ clientId: 'client-abc', secret: 'plaintext-secret', environment: 'sandbox' })
  })

  it('returns null when no credentials exist', async () => {
    const where = vi.fn().mockResolvedValue([])
    dbMock.select.mockReturnValue({ from: vi.fn(() => ({ where })) })

    const { plaidCredentialRepository } = await import('./plaidCredentialRepository.js')
    expect(await plaidCredentialRepository.getDecrypted('user-1')).toBeNull()
  })
})
