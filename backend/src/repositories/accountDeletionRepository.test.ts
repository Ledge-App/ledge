import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleted: Array<{ table: unknown; userId: unknown }> = []

const tx = {
  delete: (table: unknown) => ({
    where: async (marker: any) => {
      deleted.push({ table, userId: marker.val })
    },
  }),
}

const dbMock = { transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)) }
vi.mock('../lib/db/client.js', () => ({ db: dbMock }))

vi.mock('drizzle-orm', async (importOriginal) => ({
  // Real module underneath: the schema evaluates drizzle helpers (sql\`\`, defaults) at import
  // time, so a closed mock breaks on every helper the schema grows to use.
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: 'eq', col, val })),
}))

/** Table name as drizzle records it, so assertions can talk about tables rather than objects. */
function name(table: any): string {
  const symbol = Object.getOwnPropertySymbols(table).find((s) => s.description?.includes('Name'))
  return symbol ? table[symbol] : 'unknown'
}

describe('accountDeletionRepository.deleteAllUserData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleted.length = 0
  })

  it('deletes from every user-scoped table for that user alone', async () => {
    const { accountDeletionRepository } = await import('./accountDeletionRepository.js')

    await accountDeletionRepository.deleteAllUserData('user-1')

    expect(deleted.every((d) => d.userId === 'user-1')).toBe(true)
    expect(new Set(deleted.map((d) => name(d.table)))).toEqual(
      new Set([
        'transfers',
        'transfer_dismissals',
        'budgets',
        'transaction_overrides',
        'manual_transactions',
        'vendor_mappings',
        'plaid_category_mappings',
        'subcategories',
        'categories',
        'plaid_items',
        'plaid_credentials',
      ]),
    )
  })

  // Postgres rejects a delete that would orphan a referencing row, and none of these foreign
  // keys cascade — so ordering is the only thing keeping the transaction from failing.
  it('deletes referencing tables before the tables they point at', async () => {
    const { accountDeletionRepository } = await import('./accountDeletionRepository.js')

    await accountDeletionRepository.deleteAllUserData('user-1')

    const order = deleted.map((d) => name(d.table))
    const before = (a: string, b: string) => order.indexOf(a) < order.indexOf(b)

    for (const referencing of [
      'budgets',
      'vendor_mappings',
      'plaid_category_mappings',
      'manual_transactions',
      'transaction_overrides',
      'subcategories',
    ]) {
      expect(before(referencing, 'categories')).toBe(true)
    }
    expect(before('subcategories', 'categories')).toBe(true)
    expect(before('transfers', 'manual_transactions')).toBe(true)
  })

  it('runs as a single transaction', async () => {
    const { accountDeletionRepository } = await import('./accountDeletionRepository.js')

    await accountDeletionRepository.deleteAllUserData('user-1')

    expect(dbMock.transaction).toHaveBeenCalledTimes(1)
  })
})
