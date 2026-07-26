import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMock = { insert: vi.fn(), select: vi.fn() }
vi.mock('../lib/db/client.js', () => ({ db: dbMock }))
vi.mock('../lib/crypto/aes.js', () => ({
  encrypt: vi.fn((s: string) => `enc(${s})`),
  decrypt: vi.fn((s: string) => s.replace(/^enc\(|\)$/g, '')),
}))

describe('plaidItemRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('encrypts the access token before inserting', async () => {
    const values = vi.fn().mockResolvedValue(undefined)
    dbMock.insert.mockReturnValue({ values })

    const { plaidItemRepository } = await import('./plaidItemRepository.js')
    await plaidItemRepository.create({
      userId: 'user-1',
      institutionId: 'ins_1',
      institutionName: 'Chase',
      accessToken: 'access-sandbox-xyz',
      itemId: 'item-1',
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedAccessToken: 'enc(access-sandbox-xyz)', itemId: 'item-1' }),
    )
  })

  it('lists decrypted access tokens for a user', async () => {
    const where = vi.fn().mockResolvedValue([
      { itemId: 'item-1', encryptedAccessToken: 'enc(access-1)', institutionName: 'Chase' },
    ])
    dbMock.select.mockReturnValue({ from: vi.fn(() => ({ where })) })

    const { plaidItemRepository } = await import('./plaidItemRepository.js')
    const result = await plaidItemRepository.listDecryptedTokens('user-1')

    expect(result).toEqual([{ itemId: 'item-1', accessToken: 'access-1', institutionName: 'Chase' }])
  })
})
