import { beforeEach, describe, expect, it, vi } from 'vitest'

const credRepoMock = { getDecrypted: vi.fn() }
const itemRepoMock = { create: vi.fn() }
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: credRepoMock }))
vi.mock('../repositories/plaidItemRepository.js', () => ({ plaidItemRepository: itemRepoMock }))

const linkTokenCreate = vi.fn()
const itemPublicTokenExchange = vi.fn()
const itemGet = vi.fn()
const institutionsGetById = vi.fn()
vi.mock('../lib/plaid/client.js', () => ({
  createPlaidClient: vi.fn(() => ({
    linkTokenCreate,
    itemPublicTokenExchange,
    itemGet,
    institutionsGetById,
  })),
}))

describe('plaidLinkService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createLinkToken throws if the user has no saved Plaid credentials', async () => {
    credRepoMock.getDecrypted.mockResolvedValue(null)
    const { plaidLinkService } = await import('./plaidLinkService.js')

    await expect(plaidLinkService.createLinkToken('user-1')).rejects.toThrow(/Plaid credentials/i)
  })

  it('createLinkToken returns the link token using the user\'s own credentials', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    linkTokenCreate.mockResolvedValue({ data: { link_token: 'link-abc' } })
    const { plaidLinkService } = await import('./plaidLinkService.js')

    const result = await plaidLinkService.createLinkToken('user-1')

    expect(result).toEqual({ linkToken: 'link-abc' })
  })

  it('exchangeToken exchanges the public token and persists the encrypted access token', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemPublicTokenExchange.mockResolvedValue({ data: { access_token: 'access-1', item_id: 'item-1' } })
    itemGet.mockResolvedValue({ data: { item: { institution_id: 'ins_1' } } })
    institutionsGetById.mockResolvedValue({ data: { institution: { name: 'Chase' } } })
    itemRepoMock.create.mockResolvedValue(undefined)
    const { plaidLinkService } = await import('./plaidLinkService.js')

    const result = await plaidLinkService.exchangeToken('user-1', 'public-token-xyz')

    expect(itemRepoMock.create).toHaveBeenCalledWith({
      userId: 'user-1',
      institutionId: 'ins_1',
      institutionName: 'Chase',
      accessToken: 'access-1',
      itemId: 'item-1',
    })
    expect(result).toEqual({ institutionId: 'ins_1', institutionName: 'Chase' })
  })
})
