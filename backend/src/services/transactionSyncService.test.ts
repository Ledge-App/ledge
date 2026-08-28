import { beforeEach, describe, expect, it, vi } from 'vitest'

const credRepoMock = { getDecrypted: vi.fn() }
const itemRepoMock = { listDecryptedTokens: vi.fn() }
const transactionRepoMock = { sync: vi.fn() }
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: credRepoMock }))
vi.mock('../repositories/plaidItemRepository.js', () => ({ plaidItemRepository: itemRepoMock }))
vi.mock('../repositories/transactionRepository.js', () => ({ transactionRepository: transactionRepoMock }))
vi.mock('../lib/plaid/client.js', () => ({ createPlaidClient: vi.fn(() => ({})) }))

function page(overrides: Partial<{ added: unknown[]; modified: unknown[]; removed: unknown[]; next_cursor: string; has_more: boolean }>) {
  return { added: [], modified: [], removed: [], next_cursor: 'cursor-next', has_more: false, ...overrides }
}

describe('transactionSyncService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('isolates a failing item so other items still sync and return data', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-good', accessToken: 'a1', institutionName: 'Chase' },
      { itemId: 'item-bad', accessToken: 'a2', institutionName: 'Broken Bank' },
    ])
    transactionRepoMock.sync.mockImplementation(async (_client: unknown, accessToken: string) => {
      // Shaped like a real rejection from the axios-based Plaid SDK: the message is the generic
      // status string and the diagnosis is in the response body.
      if (accessToken === 'a2') {
        throw Object.assign(new Error('Request failed with status code 400'), {
          response: {
            data: {
              error_type: 'ITEM_ERROR',
              error_code: 'ITEM_LOGIN_REQUIRED',
              error_message: 'the login details of this item have changed',
            },
          },
        })
      }
      return page({ added: [{ transaction_id: 't1' }], next_cursor: 'cursor-good' })
    })

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', { 'item-good': '', 'item-bad': 'old-cursor' })

    expect(result.added).toEqual([{ transaction_id: 't1' }])
    expect(result.cursors).toEqual({ 'item-good': 'cursor-good' })
    expect(result.hasMore).toEqual({ 'item-good': false })
    expect(result.itemErrors).toEqual([
      {
        itemId: 'item-bad',
        message: 'the login details of this item have changed',
        errorCode: 'ITEM_LOGIN_REQUIRED',
      },
    ])
  })

  it('returns empty results with no errors when there are no linked items', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([])

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', {})

    expect(result).toEqual({ added: [], modified: [], removed: [], cursors: {}, hasMore: {}, rateLimited: {}, itemErrors: [] })
  })

  it('drains an item across multiple pages until has_more is false', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([{ itemId: 'item-1', accessToken: 'a1', institutionName: 'Chase' }])
    transactionRepoMock.sync
      .mockResolvedValueOnce(page({ added: [{ transaction_id: 't1' }], next_cursor: 'c1', has_more: true }))
      .mockResolvedValueOnce(page({ added: [{ transaction_id: 't2' }], next_cursor: 'c2', has_more: true }))
      .mockResolvedValueOnce(page({ added: [{ transaction_id: 't3' }], removed: [{ transaction_id: 't0' }], next_cursor: 'c3', has_more: false }))

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', {})

    expect(transactionRepoMock.sync).toHaveBeenCalledTimes(3)
    // Each page resumes from the cursor the previous page returned.
    expect(transactionRepoMock.sync.mock.calls.map((c) => c[2])).toEqual(['', 'c1', 'c2'])
    expect(result.added.map((t) => (t as { transaction_id: string }).transaction_id)).toEqual(['t1', 't2', 't3'])
    expect(result.removed).toEqual([{ transaction_id: 't0' }])
    expect(result.cursors).toEqual({ 'item-1': 'c3' })
    expect(result.hasMore).toEqual({ 'item-1': false })
  })

  it('stops at the page cap and reports hasMore true so the client re-syncs', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([{ itemId: 'item-1', accessToken: 'a1', institutionName: 'Chase' }])
    transactionRepoMock.sync.mockImplementation(async (_client: unknown, _token: string, cursor: string) =>
      page({ added: [{ transaction_id: `t-${cursor || 'start'}` }], next_cursor: `${cursor}x`, has_more: true }),
    )

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', {})

    expect(transactionRepoMock.sync).toHaveBeenCalledTimes(10)
    expect(result.hasMore).toEqual({ 'item-1': true })
    // Cursor reflects the last drained page so the follow-up sync resumes, not restarts.
    expect(result.cursors).toEqual({ 'item-1': 'xxxxxxxxxx' })
  })

  it('keeps the last successful page cursor when a later page fails, as a resume point', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([{ itemId: 'item-1', accessToken: 'a1', institutionName: 'Chase' }])
    transactionRepoMock.sync
      .mockResolvedValueOnce(page({ added: [{ transaction_id: 't1' }], next_cursor: 'c1', has_more: true }))
      // No response body: a transport failure that never reached Plaid, so there is no code.
      .mockRejectedValueOnce(new Error('socket hang up'))

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', {})

    expect(result.added).toEqual([{ transaction_id: 't1' }])
    expect(result.cursors).toEqual({ 'item-1': 'c1' })
    expect(result.hasMore).toEqual({})
    expect(result.itemErrors).toEqual([{ itemId: 'item-1', message: 'socket hang up' }])
  })

  it('restarts from the original cursor when Plaid reports mutation-during-pagination', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([{ itemId: 'item-1', accessToken: 'a1', institutionName: 'Chase' }])
    const plaidError = Object.assign(new Error('mutation during pagination'), {
      response: { data: { error_code: 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' } },
    })
    transactionRepoMock.sync
      .mockResolvedValueOnce(page({ added: [{ transaction_id: 't1' }], next_cursor: 'c1', has_more: true }))
      .mockRejectedValueOnce(plaidError)

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', { 'item-1': 'original' })

    // Plaid requires pagination to restart from the cursor it began with.
    expect(result.cursors).toEqual({ 'item-1': 'original' })
    expect(result.itemErrors).toHaveLength(1)
  })

  it('reports a rate-limited item as undrained rather than as a failure', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([{ itemId: 'item-1', accessToken: 'a1', institutionName: 'Chase' }])
    const rateLimited = Object.assign(new Error('too many requests'), {
      response: { data: { error_type: 'RATE_LIMIT_EXCEEDED', error_code: 'TRANSACTIONS_LIMIT' } },
    })
    transactionRepoMock.sync
      .mockResolvedValueOnce(page({ added: [{ transaction_id: 't1' }], next_cursor: 'c1', has_more: true }))
      .mockRejectedValueOnce(rateLimited)

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', {})

    // The pages already drained are kept, and the cursor still marks a valid resume point.
    expect(result.added).toEqual([{ transaction_id: 't1' }])
    expect(result.cursors).toEqual({ 'item-1': 'c1' })
    // hasMore true because progress is real and more remains; rateLimited is what tells the
    // client to wait before using it, instead of re-firing immediately.
    expect(result.hasMore).toEqual({ 'item-1': true })
    expect(result.rateLimited).toEqual({ 'item-1': true })
    // Being throttled is not a broken item — surfacing it as one would mislead the user.
    expect(result.itemErrors).toEqual([])
  })

  it('reports a rate limit on the first page with no cursor to advance', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([{ itemId: 'item-1', accessToken: 'a1', institutionName: 'Chase' }])
    transactionRepoMock.sync.mockRejectedValue(
      Object.assign(new Error('too many requests'), { response: { data: { error_type: 'RATE_LIMIT_EXCEEDED' } } }),
    )

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', { 'item-1': 'stored' })

    // No page landed, so no cursor is returned; the client keeps the one it already has.
    expect(result.cursors).toEqual({})
    expect(result.hasMore).toEqual({ 'item-1': true })
    expect(result.rateLimited).toEqual({ 'item-1': true })
    expect(result.itemErrors).toEqual([])
  })

  it('lets other items keep draining when one item is rate-limited', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-limited', accessToken: 'a1', institutionName: 'Chase' },
      { itemId: 'item-fine', accessToken: 'a2', institutionName: 'Amex' },
    ])
    transactionRepoMock.sync.mockImplementation(async (_client: unknown, accessToken: string) => {
      if (accessToken === 'a1') {
        throw Object.assign(new Error('too many requests'), {
          response: { data: { error_type: 'RATE_LIMIT_EXCEEDED' } },
        })
      }
      return page({ added: [{ transaction_id: 't2' }], next_cursor: 'c-fine' })
    })

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', {})

    expect(result.added).toEqual([{ transaction_id: 't2' }])
    expect(result.cursors).toEqual({ 'item-fine': 'c-fine' })
    expect(result.hasMore).toEqual({ 'item-limited': true, 'item-fine': false })
    expect(result.rateLimited).toEqual({ 'item-limited': true })
    expect(result.itemErrors).toEqual([])
  })

})
