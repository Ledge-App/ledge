import { beforeEach, describe, expect, it, vi } from 'vitest'

const credRepoMock = { getDecrypted: vi.fn() }
const itemRepoMock = { listDecryptedTokens: vi.fn() }
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: credRepoMock }))
vi.mock('../repositories/plaidItemRepository.js', () => ({ plaidItemRepository: itemRepoMock }))

const accountsGet = vi.fn()
vi.mock('../lib/plaid/client.js', () => ({ createPlaidClient: vi.fn(() => ({ accountsGet })) }))

describe('accounts router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('list relays live balances across every linked item, tagged with institution name', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-1', accessToken: 'access-1', institutionName: 'Chase' },
    ])
    accountsGet.mockResolvedValue({
      data: { accounts: [{ account_id: 'acc-1', name: 'Sapphire', balances: { current: 4821 } }] },
    })

    const { accountsRouter } = await import('./accounts.js')
    const caller = accountsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    const result = await caller.list()

    expect(accountsGet).toHaveBeenCalledWith({ access_token: 'access-1' })
    expect(result).toEqual([
      { account_id: 'acc-1', name: 'Sapphire', balances: { current: 4821 }, institutionName: 'Chase' },
    ])
  })
})
