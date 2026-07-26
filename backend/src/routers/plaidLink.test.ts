import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMock = { createLinkToken: vi.fn(), exchangeToken: vi.fn() }
vi.mock('../services/plaidLinkService.js', () => ({ plaidLinkService: serviceMock }))

describe('plaidLink router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createLinkToken delegates to the service with the authenticated user id', async () => {
    serviceMock.createLinkToken.mockResolvedValue({ linkToken: 'link-abc' })
    const { plaidLinkRouter } = await import('./plaidLink.js')
    const caller = plaidLinkRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    expect(await caller.createLinkToken()).toEqual({ linkToken: 'link-abc' })
    expect(serviceMock.createLinkToken).toHaveBeenCalledWith('user-1')
  })

  it('exchangeToken passes the public token through', async () => {
    serviceMock.exchangeToken.mockResolvedValue({ institutionId: 'ins_1', institutionName: 'Chase' })
    const { plaidLinkRouter } = await import('./plaidLink.js')
    const caller = plaidLinkRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    const result = await caller.exchangeToken({ publicToken: 'public-token-xyz' })

    expect(serviceMock.exchangeToken).toHaveBeenCalledWith('user-1', 'public-token-xyz')
    expect(result).toEqual({ institutionId: 'ins_1', institutionName: 'Chase' })
  })
})
