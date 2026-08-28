import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../repositories/plaidCredentialRepository.js', () => ({
  plaidCredentialRepository: { getDecrypted: vi.fn() },
}))
vi.mock('../repositories/plaidItemRepository.js', () => ({
  plaidItemRepository: { listDecryptedTokens: vi.fn() },
}))
vi.mock('../lib/plaid/client.js', () => ({ createPlaidClient: vi.fn(() => ({})) }))
vi.mock('../repositories/investmentRepository.js', () => ({
  investmentRepository: { getTransactions: vi.fn() },
}))

const { plaidCredentialRepository } = await import('../repositories/plaidCredentialRepository.js')
const { plaidItemRepository } = await import('../repositories/plaidItemRepository.js')
const { investmentRepository } = await import('../repositories/investmentRepository.js')
const { investmentTransactionService } = await import('./investmentTransactionService.js')

const row = (id: string) => ({
  investmentTransactionId: id,
  accountId: 'acc-1',
  date: '2026-02-03',
  name: 'ACH Deposit',
  amount: -1000,
  quantity: 0,
  price: 0,
  fees: null,
  type: 'cash',
  subtype: 'contribution',
  ticker: null,
  securityName: null,
})

beforeEach(() => {
  vi.mocked(plaidCredentialRepository.getDecrypted).mockResolvedValue({
    clientId: 'cid',
    secret: 'sec',
    environment: 'sandbox',
  } as never)
})

describe('investmentTransactionService.fetch', () => {
  it('keys results by item id', async () => {
    vi.mocked(plaidItemRepository.listDecryptedTokens).mockResolvedValue([
      { itemId: 'item-a', accessToken: 'tok-a' },
      { itemId: 'item-b', accessToken: 'tok-b' },
    ] as never)
    vi.mocked(investmentRepository.getTransactions)
      .mockResolvedValueOnce([row('itx-a')])
      .mockResolvedValueOnce([row('itx-b')])

    const result = await investmentTransactionService.fetch('user-1', '2024-08-08', '2026-08-08')

    expect(Object.keys(result.byItem).sort()).toEqual(['item-a', 'item-b'])
    expect(result.byItem['item-a'].map((t) => t.investmentTransactionId)).toEqual(['itx-a'])
    expect(result.itemErrors).toEqual([])
  })

  it('isolates a failing item so the others still return', async () => {
    vi.mocked(plaidItemRepository.listDecryptedTokens).mockResolvedValue([
      { itemId: 'item-a', accessToken: 'tok-a' },
      { itemId: 'item-b', accessToken: 'tok-b' },
    ] as never)
    vi.mocked(investmentRepository.getTransactions)
      .mockRejectedValueOnce(
        Object.assign(new Error('Request failed with status code 400'), {
          response: {
            data: {
              error_type: 'INVALID_INPUT',
              error_code: 'ADDITIONAL_CONSENT_REQUIRED',
              error_message: 'this item requires additional consent',
            },
          },
        }),
      )
      .mockResolvedValueOnce([row('itx-b')])

    const result = await investmentTransactionService.fetch('user-1', '2024-08-08', '2026-08-08')

    expect(result.byItem['item-a']).toBeUndefined()
    expect(result.byItem['item-b'].map((t) => t.investmentTransactionId)).toEqual(['itx-b'])
    // The code is what lets the client tell an unsupported product from missing consent; the
    // message alone was the same axios status string for both.
    expect(result.itemErrors).toEqual([
      {
        itemId: 'item-a',
        message: 'this item requires additional consent',
        errorCode: 'ADDITIONAL_CONSENT_REQUIRED',
      },
    ])
  })

  it('throws when the user has no Plaid credentials', async () => {
    vi.mocked(plaidCredentialRepository.getDecrypted).mockResolvedValue(null as never)

    await expect(investmentTransactionService.fetch('user-1', '2024-08-08', '2026-08-08')).rejects.toThrow(
      'No Plaid credentials saved for this user.',
    )
  })
})
