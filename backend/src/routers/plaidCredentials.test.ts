import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMock = { save: vi.fn(), test: vi.fn(), get: vi.fn() }
vi.mock('../services/plaidCredentialService.js', () => ({ plaidCredentialService: serviceMock }))

describe('plaidCredentials router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('save calls the service with the authenticated user id and input', async () => {
    serviceMock.save.mockResolvedValue({ ok: true })
    const { plaidCredentialsRouter } = await import('./plaidCredentials.js')
    const caller = plaidCredentialsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    const result = await caller.save({ clientId: 'client-abc', secret: 'secret-abc', environment: 'sandbox' })

    expect(serviceMock.save).toHaveBeenCalledWith('user-1', {
      clientId: 'client-abc',
      secret: 'secret-abc',
      environment: 'sandbox',
    })
    expect(result).toEqual({ ok: true })
  })

  it('get calls the service with the authenticated user id', async () => {
    serviceMock.get.mockResolvedValue({ clientId: 'client-abc', environment: 'sandbox', hasSecret: true })
    const { plaidCredentialsRouter } = await import('./plaidCredentials.js')
    const caller = plaidCredentialsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    const result = await caller.get()

    expect(serviceMock.get).toHaveBeenCalledWith('user-1')
    expect(result).toEqual({ clientId: 'client-abc', environment: 'sandbox', hasSecret: true })
  })
})
