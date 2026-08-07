import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMock = { save: vi.fn(), test: vi.fn(), get: vi.fn(), allowedEnvironments: vi.fn() }
vi.mock('../services/plaidCredentialService.js', () => ({ plaidCredentialService: serviceMock }))

const ctx = { userId: 'user-1', email: 'user@example.com', jwt: 'jwt-1' }

describe('plaidCredentials router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('save calls the service with the authenticated user id, email and input', async () => {
    serviceMock.save.mockResolvedValue({ ok: true })
    const { plaidCredentialsRouter } = await import('./plaidCredentials.js')
    const caller = plaidCredentialsRouter.createCaller(ctx)

    const result = await caller.save({ clientId: 'client-abc', secret: 'secret-abc', environment: 'production' })

    expect(serviceMock.save).toHaveBeenCalledWith('user-1', 'user@example.com', {
      clientId: 'client-abc',
      secret: 'secret-abc',
      environment: 'production',
    })
    expect(result).toEqual({ ok: true })
  })

  it('test calls the service with the authenticated user id', async () => {
    serviceMock.test.mockResolvedValue({ ok: true })
    const { plaidCredentialsRouter } = await import('./plaidCredentials.js')
    const caller = plaidCredentialsRouter.createCaller(ctx)

    await caller.test({ clientId: 'client-abc', secret: 'secret-abc', environment: 'production' })

    expect(serviceMock.test).toHaveBeenCalledWith('user-1', 'user@example.com', {
      clientId: 'client-abc',
      secret: 'secret-abc',
      environment: 'production',
    })
  })

  it('rejects an environment the schema no longer recognises', async () => {
    const { plaidCredentialsRouter } = await import('./plaidCredentials.js')
    const caller = plaidCredentialsRouter.createCaller(ctx)

    await expect(
      caller.save({ clientId: 'client-abc', secret: 'secret-abc', environment: 'development' as never }),
    ).rejects.toThrow()
    expect(serviceMock.save).not.toHaveBeenCalled()
  })

  it('capabilities reports the environments this account may choose', async () => {
    serviceMock.allowedEnvironments.mockResolvedValue(['production', 'sandbox'])
    const { plaidCredentialsRouter } = await import('./plaidCredentials.js')
    const caller = plaidCredentialsRouter.createCaller(ctx)

    const result = await caller.capabilities()

    expect(serviceMock.allowedEnvironments).toHaveBeenCalledWith('user@example.com')
    expect(result).toEqual({ allowedEnvironments: ['production', 'sandbox'] })
  })

  it('get calls the service with the authenticated user id', async () => {
    serviceMock.get.mockResolvedValue({ clientId: 'client-abc', environment: 'production', hasSecret: true })
    const { plaidCredentialsRouter } = await import('./plaidCredentials.js')
    const caller = plaidCredentialsRouter.createCaller(ctx)

    const result = await caller.get()

    expect(serviceMock.get).toHaveBeenCalledWith('user-1')
    expect(result).toEqual({ clientId: 'client-abc', environment: 'production', hasSecret: true })
  })
})
