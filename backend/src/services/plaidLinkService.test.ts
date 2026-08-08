import { beforeEach, describe, expect, it, vi } from 'vitest'

const credRepoMock = { getDecrypted: vi.fn() }
const itemRepoMock = { create: vi.fn(), listDecryptedTokens: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: credRepoMock }))
vi.mock('../repositories/plaidItemRepository.js', () => ({ plaidItemRepository: itemRepoMock }))

const linkTokenCreate = vi.fn()
const itemPublicTokenExchange = vi.fn()
const itemGet = vi.fn()
const institutionsGetById = vi.fn()
const itemRemove = vi.fn()
vi.mock('../lib/plaid/client.js', () => ({
  createPlaidClient: vi.fn(() => ({
    linkTokenCreate,
    itemPublicTokenExchange,
    itemGet,
    institutionsGetById,
    itemRemove,
  })),
}))

/** Standard happy-path plaid responses for an exchange against Fidelity. */
function mockExchange() {
  credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
  itemPublicTokenExchange.mockResolvedValue({ data: { access_token: 'access-new', item_id: 'item-new' } })
  itemGet.mockResolvedValue({ data: { item: { institution_id: 'ins_fid' } } })
  institutionsGetById.mockResolvedValue({ data: { institution: { name: 'Fidelity' } } })
  itemRepoMock.create.mockResolvedValue(undefined)
  itemRepoMock.delete.mockResolvedValue(undefined)
  itemRemove.mockResolvedValue(undefined)
}

describe('plaidLinkService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createLinkToken throws if the user has no saved Plaid credentials', async () => {
    credRepoMock.getDecrypted.mockResolvedValue(null)
    const { plaidLinkService } = await import('./plaidLinkService.js')

    await expect(plaidLinkService.createLinkToken('user-1')).rejects.toThrow(/Plaid credentials/i)
  })

  it("createLinkToken returns the link token using the user's own credentials", async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    linkTokenCreate.mockResolvedValue({ data: { link_token: 'link-abc' } })
    const { plaidLinkService } = await import('./plaidLinkService.js')

    const result = await plaidLinkService.createLinkToken('user-1')

    expect(result).toEqual({ linkToken: 'link-abc' })
  })

  it('exchangeToken exchanges the public token and persists the encrypted access token', async () => {
    mockExchange()
    itemRepoMock.listDecryptedTokens.mockResolvedValue([])
    const { plaidLinkService } = await import('./plaidLinkService.js')

    const result = await plaidLinkService.exchangeToken('user-1', 'public-token-xyz')

    expect(itemRepoMock.create).toHaveBeenCalledWith({
      userId: 'user-1',
      institutionId: 'ins_fid',
      institutionName: 'Fidelity',
      accessToken: 'access-new',
      itemId: 'item-new',
      // No logo in the institution response -> '' (fetched-none), never re-fetched.
      institutionLogo: '',
    })
    expect(result).toEqual({ institutionId: 'ins_fid', institutionName: 'Fidelity' })
  })

  it('exchangeToken stores the institution logo when Plaid provides one', async () => {
    mockExchange()
    institutionsGetById.mockResolvedValue({ data: { institution: { name: 'Fidelity', logo: 'aWNvbg==' } } })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([])
    const { plaidLinkService } = await import('./plaidLinkService.js')

    await plaidLinkService.exchangeToken('user-1', 'public-token-xyz')

    expect(institutionsGetById).toHaveBeenCalledWith(
      expect.objectContaining({ options: { include_optional_metadata: true } }),
    )
    expect(itemRepoMock.create).toHaveBeenCalledWith(expect.objectContaining({ institutionLogo: 'aWNvbg==' }))
  })

  describe('relinking an institution (clean-slate replacement)', () => {
    const existingItem = { itemId: 'item-old', accessToken: 'access-old', institutionId: 'ins_fid', institutionName: 'Fidelity', institutionLogo: null }

    it('replaces the existing connection: old Item removed at Plaid and locally, new one stored', async () => {
      mockExchange()
      itemRepoMock.listDecryptedTokens.mockResolvedValue([existingItem])
      const { plaidLinkService } = await import('./plaidLinkService.js')

      await plaidLinkService.exchangeToken('user-1', 'public-token-xyz')

      expect(itemRemove).toHaveBeenCalledWith({ access_token: 'access-old' })
      expect(itemRepoMock.delete).toHaveBeenCalledWith('user-1', 'item-old')
      expect(itemRepoMock.create).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'item-new' }))
    })

    it('replaces every prior connection for the institution, so Settings shows it once', async () => {
      mockExchange()
      itemRepoMock.listDecryptedTokens.mockResolvedValue([
        existingItem,
        { ...existingItem, itemId: 'item-older', accessToken: 'access-older' },
      ])
      const { plaidLinkService } = await import('./plaidLinkService.js')

      await plaidLinkService.exchangeToken('user-1', 'public-token-xyz')

      expect(itemRepoMock.delete).toHaveBeenCalledWith('user-1', 'item-old')
      expect(itemRepoMock.delete).toHaveBeenCalledWith('user-1', 'item-older')
      expect(itemRepoMock.create).toHaveBeenCalledTimes(1)
    })

    it('still stores the new Item when revoking the old one at Plaid fails', async () => {
      mockExchange()
      itemRemove.mockRejectedValue(new Error('ITEM_NOT_FOUND'))
      itemRepoMock.listDecryptedTokens.mockResolvedValue([existingItem])
      const { plaidLinkService } = await import('./plaidLinkService.js')

      await plaidLinkService.exchangeToken('user-1', 'public-token-xyz')

      expect(itemRepoMock.delete).toHaveBeenCalledWith('user-1', 'item-old')
      expect(itemRepoMock.create).toHaveBeenCalled()
    })

    it('leaves other institutions untouched', async () => {
      mockExchange()
      itemRepoMock.listDecryptedTokens.mockResolvedValue([
        { ...existingItem, itemId: 'item-chase', accessToken: 'access-chase', institutionId: 'ins_chase' },
      ])
      const { plaidLinkService } = await import('./plaidLinkService.js')

      await plaidLinkService.exchangeToken('user-1', 'public-token-xyz')

      expect(itemRemove).not.toHaveBeenCalled()
      expect(itemRepoMock.delete).not.toHaveBeenCalled()
      expect(itemRepoMock.create).toHaveBeenCalled()
    })
  })
})
