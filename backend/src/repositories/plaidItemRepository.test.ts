import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMock = { insert: vi.fn(), select: vi.fn(), update: vi.fn() }
vi.mock('../lib/db/client.js', () => ({ db: dbMock }))
vi.mock('../lib/crypto/aes.js', () => ({
  encrypt: vi.fn((s: string) => `enc(${s})`),
  decrypt: vi.fn((s: string) => s.replace(/^enc\(|\)$/g, '')),
}))

// Conditions become inspectable markers so a test can assert which filters a query applied —
// the `where` mocks below resolve regardless of their argument, so without this the difference
// between "live items only" and "every item" would be invisible.
vi.mock('drizzle-orm', async (importOriginal) => ({
  // Real module underneath: the schema evaluates drizzle helpers (sql\`\`, defaults) at import
  // time, so a closed mock breaks on every helper the schema grows to use.
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
  and: vi.fn((...conds: unknown[]) => ({ op: 'and', conds })),
  isNull: vi.fn((col: unknown) => ({ op: 'isNull', col })),
}))

/** Every condition in a (possibly nested) marker tree, flattened. */
function conditions(marker: any): any[] {
  if (!marker || typeof marker !== 'object') return []
  if (marker.op === 'and') return marker.conds.flatMap(conditions)
  return [marker]
}

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

  describe('soft disconnect', () => {
    function mockSelect(rows: unknown[]) {
      const where = vi.fn().mockResolvedValue(rows)
      dbMock.select.mockReturnValue({ from: vi.fn(() => ({ where })) })
      return where
    }

    it('listDecryptedTokens excludes disconnected items, so they stop syncing', async () => {
      const where = mockSelect([])

      const { plaidItemRepository } = await import('./plaidItemRepository.js')
      await plaidItemRepository.listDecryptedTokens('user-1')

      expect(conditions(where.mock.calls[0][0]).some((c) => c.op === 'isNull')).toBe(true)
    })

    it('list keeps disconnected items, since Settings is where they are reconnected', async () => {
      const where = mockSelect([
        {
          id: 'row-1',
          itemId: 'item-1',
          institutionId: 'ins_chase',
          institutionName: 'Chase',
          disabledAt: new Date('2026-08-01T00:00:00Z'),
        },
      ])

      const { plaidItemRepository } = await import('./plaidItemRepository.js')
      const result = await plaidItemRepository.list('user-1')

      expect(conditions(where.mock.calls[0][0]).some((c) => c.op === 'isNull')).toBe(false)
      expect(result[0]).toMatchObject({ itemId: 'item-1', disabled: true })
    })

    it('getDecryptedToken reaches a disconnected item and reports it as disabled', async () => {
      const where = mockSelect([
        {
          itemId: 'item-1',
          encryptedAccessToken: 'enc(access-1)',
          institutionName: 'Chase',
          institutionId: 'ins_chase',
          disabledAt: new Date('2026-08-01T00:00:00Z'),
        },
      ])

      const { plaidItemRepository } = await import('./plaidItemRepository.js')
      const result = await plaidItemRepository.getDecryptedToken('user-1', 'item-1')

      expect(conditions(where.mock.calls[0][0]).some((c) => c.op === 'isNull')).toBe(false)
      expect(result).toEqual({
        itemId: 'item-1',
        accessToken: 'access-1',
        institutionName: 'Chase',
        institutionId: 'ins_chase',
        disabled: true,
      })
    })

    it('getDecryptedToken returns null for an unknown item', async () => {
      mockSelect([])

      const { plaidItemRepository } = await import('./plaidItemRepository.js')

      await expect(plaidItemRepository.getDecryptedToken('user-1', 'nope')).resolves.toBeNull()
    })

    it('setDisabled stamps a time to disconnect and clears it to reconnect', async () => {
      const applied: Array<{ disabledAt: Date | null }> = []
      const set = vi.fn((values: { disabledAt: Date | null }) => {
        applied.push(values)
        return { where: vi.fn().mockResolvedValue(undefined) }
      })
      dbMock.update.mockReturnValue({ set })

      const { plaidItemRepository } = await import('./plaidItemRepository.js')

      await plaidItemRepository.setDisabled('user-1', 'item-1', true)
      expect(applied[0]?.disabledAt).toBeInstanceOf(Date)

      await plaidItemRepository.setDisabled('user-1', 'item-1', false)
      expect(applied[1]).toEqual({ disabledAt: null })
    })

    // Account deletion revokes through this, and a disconnected Item is still live at Plaid —
    // skipping it would leave a token valid for data the user asked us to erase.
    it('listAllDecryptedTokens keeps disconnected items', async () => {
      const where = mockSelect([
        { itemId: 'item-1', encryptedAccessToken: 'enc(access-1)', disabledAt: null },
        { itemId: 'item-2', encryptedAccessToken: 'enc(access-2)', disabledAt: new Date() },
      ])

      const { plaidItemRepository } = await import('./plaidItemRepository.js')
      const result = await plaidItemRepository.listAllDecryptedTokens('user-1')

      expect(conditions(where.mock.calls[0][0]).some((c) => c.op === 'isNull')).toBe(false)
      expect(result).toEqual([
        { itemId: 'item-1', accessToken: 'access-1' },
        { itemId: 'item-2', accessToken: 'access-2' },
      ])
    })
  })
})
