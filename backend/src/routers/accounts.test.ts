import { beforeEach, describe, expect, it, vi } from 'vitest'

const credRepoMock = { getDecrypted: vi.fn() }
const itemRepoMock = { listDecryptedTokens: vi.fn() }
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: credRepoMock }))
vi.mock('../repositories/plaidItemRepository.js', () => ({ plaidItemRepository: itemRepoMock }))

const accountsGet = vi.fn()
vi.mock('../lib/plaid/client.js', () => ({ createPlaidClient: vi.fn(() => ({ accountsGet })) }))

const ctx = { userId: 'user-1', email: 'user@example.com', jwt: 'jwt-1' }

describe('accounts router', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'production' })
  })

  it('list relays live balances across every linked item, tagged with institution name', async () => {
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-1', accessToken: 'access-1', institutionName: 'Chase' },
    ])
    accountsGet.mockResolvedValue({
      data: { accounts: [{ account_id: 'acc-1', name: 'Sapphire', balances: { current: 4821 } }] },
    })

    const { accountsRouter } = await import('./accounts.js')
    const caller = accountsRouter.createCaller(ctx)

    const result = await caller.list()

    expect(accountsGet).toHaveBeenCalledWith({ access_token: 'access-1' })
    expect(result).toEqual({
      accounts: [
        {
          account_id: 'acc-1',
          name: 'Sapphire',
          balances: { current: 4821 },
          institutionName: 'Chase',
          itemId: 'item-1',
        },
      ],
      itemErrors: [],
    })
  })

  it('returns the surviving accounts when one item fails, instead of throwing', async () => {
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-broken', accessToken: 'access-broken', institutionName: 'Old Bank' },
      { itemId: 'item-ok', accessToken: 'access-ok', institutionName: 'Chase' },
    ])
    accountsGet
      .mockRejectedValueOnce(new Error('the login details of this item have changed'))
      .mockResolvedValueOnce({ data: { accounts: [{ account_id: 'acc-1', name: 'Sapphire' }] } })

    const { accountsRouter } = await import('./accounts.js')
    const caller = accountsRouter.createCaller(ctx)

    const result = await caller.list()

    expect(result.accounts).toEqual([
      { account_id: 'acc-1', name: 'Sapphire', institutionName: 'Chase', itemId: 'item-ok' },
    ])
    expect(result.itemErrors).toEqual([
      {
        itemId: 'item-broken',
        institutionName: 'Old Bank',
        message: 'the login details of this item have changed',
      },
    ])
  })

  it('reports every failing item rather than stopping at the first', async () => {
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-a', accessToken: 'access-a', institutionName: 'Bank A' },
      { itemId: 'item-b', accessToken: 'access-b', institutionName: 'Bank B' },
    ])
    accountsGet.mockRejectedValue(new Error('nope'))

    const { accountsRouter } = await import('./accounts.js')
    const caller = accountsRouter.createCaller(ctx)

    const result = await caller.list()

    expect(result.accounts).toEqual([])
    expect(result.itemErrors.map((e) => e.itemId)).toEqual(['item-a', 'item-b'])
  })

  it('still throws when the user has no credentials at all', async () => {
    credRepoMock.getDecrypted.mockResolvedValue(null)

    const { accountsRouter } = await import('./accounts.js')
    const caller = accountsRouter.createCaller(ctx)

    await expect(caller.list()).rejects.toThrow()
  })
})
