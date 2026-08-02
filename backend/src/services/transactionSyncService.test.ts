import { beforeEach, describe, expect, it, vi } from 'vitest'

const credRepoMock = { getDecrypted: vi.fn() }
const itemRepoMock = { listDecryptedTokens: vi.fn() }
const transactionRepoMock = { sync: vi.fn() }
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: credRepoMock }))
vi.mock('../repositories/plaidItemRepository.js', () => ({ plaidItemRepository: itemRepoMock }))
vi.mock('../repositories/transactionRepository.js', () => ({ transactionRepository: transactionRepoMock }))
vi.mock('../lib/plaid/client.js', () => ({ createPlaidClient: vi.fn(() => ({})) }))

describe('transactionSyncService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('isolates a failing item so other items still sync and return data', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-good', accessToken: 'a1', institutionName: 'Chase' },
      { itemId: 'item-bad', accessToken: 'a2', institutionName: 'Broken Bank' },
    ])
    transactionRepoMock.sync.mockImplementation(async (_client: unknown, accessToken: string) => {
      if (accessToken === 'a2') throw new Error('ITEM_LOGIN_REQUIRED')
      return { added: [{ transaction_id: 't1' }], modified: [], removed: [], next_cursor: 'cursor-good', has_more: false }
    })

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', { 'item-good': '', 'item-bad': 'old-cursor' })

    expect(result.added).toEqual([{ transaction_id: 't1' }])
    expect(result.cursors).toEqual({ 'item-good': 'cursor-good' })
    expect(result.itemErrors).toEqual([{ itemId: 'item-bad', message: 'ITEM_LOGIN_REQUIRED' }])
  })

  it('returns empty results with no errors when there are no linked items', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([])

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', {})

    expect(result).toEqual({ added: [], modified: [], removed: [], cursors: {}, hasMore: false, itemErrors: [] })
  })
})
