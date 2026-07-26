import { beforeEach, describe, expect, it, vi } from 'vitest'

const credRepoMock = { getDecrypted: vi.fn() }
const itemRepoMock = { listDecryptedTokens: vi.fn() }
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: credRepoMock }))
vi.mock('../repositories/plaidItemRepository.js', () => ({ plaidItemRepository: itemRepoMock }))

const transactionsSync = vi.fn()
vi.mock('../lib/plaid/client.js', () => ({
  createPlaidClient: vi.fn(() => ({ transactionsSync })),
}))

describe('transactionSyncService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('relays added/modified/removed transactions from every linked item without persisting them', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-1', accessToken: 'access-1', institutionName: 'Chase' },
    ])
    transactionsSync.mockResolvedValue({
      data: {
        added: [{ transaction_id: 't1', amount: 12.5 }],
        modified: [],
        removed: [],
        next_cursor: 'cursor-2',
        has_more: false,
      },
    })

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', { 'item-1': 'cursor-1' })

    expect(transactionsSync).toHaveBeenCalledWith({ access_token: 'access-1', cursor: 'cursor-1' })
    expect(result).toEqual({
      added: [{ transaction_id: 't1', amount: 12.5 }],
      modified: [],
      removed: [],
      cursors: { 'item-1': 'cursor-2' },
      hasMore: false,
    })
  })

  it('defaults to an empty cursor for items not yet synced', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-new', accessToken: 'access-new', institutionName: 'Amex' },
    ])
    transactionsSync.mockResolvedValue({
      data: { added: [], modified: [], removed: [], next_cursor: 'cursor-1', has_more: false },
    })

    const { transactionSyncService } = await import('./transactionSyncService.js')
    await transactionSyncService.sync('user-1', {})

    expect(transactionsSync).toHaveBeenCalledWith({ access_token: 'access-new', cursor: '' })
  })
})
