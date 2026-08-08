import { describe, expect, it, vi } from 'vitest'
import type { PlaidApi } from 'plaid'
import { transactionRepository } from './transactionRepository.js'

function clientStub() {
  const transactionsSync = vi.fn().mockResolvedValue({ data: { added: [], modified: [], removed: [], next_cursor: 'c1', has_more: false } })
  return { transactionsSync } as unknown as PlaidApi & { transactionsSync: ReturnType<typeof vi.fn> }
}

describe('transactionRepository.sync', () => {
  // Without an explicit version, each user's own Plaid account decides which PFC taxonomy they
  // receive (v1 before 2025-12-03, v2 after). DEFAULT_PFC_MAPPING is one hardcoded table, so
  // under BYOK an unpinned version means two users on the same build categorize differently.
  it('pins the personal finance category taxonomy to v2', async () => {
    const client = clientStub()
    await transactionRepository.sync(client, 'access-token', 'cursor-1')

    const request = client.transactionsSync.mock.calls[0][0]
    expect(request.options.personal_finance_category_version).toBe('v2')
  })

  it('requests Plaid’s maximum page size so initial history drains in fewer round trips', async () => {
    const client = clientStub()
    await transactionRepository.sync(client, 'access-token', 'cursor-1')

    expect(client.transactionsSync.mock.calls[0][0].count).toBe(500)
  })

  it('passes the access token and cursor through unchanged', async () => {
    const client = clientStub()
    await transactionRepository.sync(client, 'access-token', 'cursor-1')

    expect(client.transactionsSync.mock.calls[0][0]).toMatchObject({ access_token: 'access-token', cursor: 'cursor-1' })
  })

  it('returns the response payload unwrapped', async () => {
    const client = clientStub()
    const result = await transactionRepository.sync(client, 'access-token', '')

    expect(result).toMatchObject({ next_cursor: 'c1', has_more: false })
  })
})
