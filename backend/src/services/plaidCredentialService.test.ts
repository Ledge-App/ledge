import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = {
  upsert: vi.fn(),
  getDecrypted: vi.fn(),
  getMasked: vi.fn(),
}
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: repoMock }))

const itemGet = vi.fn()
vi.mock('../lib/plaid/client.js', () => ({
  createPlaidClient: vi.fn(() => ({ itemGet })),
}))

describe('plaidCredentialService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('test() reports success when Plaid accepts the credentials', async () => {
    itemGet.mockResolvedValue({ data: {} })
    const { plaidCredentialService } = await import('./plaidCredentialService.js')

    const result = await plaidCredentialService.test({
      clientId: 'client-abc',
      secret: 'secret-abc',
      environment: 'sandbox',
    })

    expect(result).toEqual({ ok: true })
  })

  it('test() reports the specific Plaid error on failure', async () => {
    itemGet.mockRejectedValue({
      response: { data: { error_code: 'INVALID_API_KEYS', error_message: "Couldn't verify these keys" } },
    })
    const { plaidCredentialService } = await import('./plaidCredentialService.js')

    const result = await plaidCredentialService.test({
      clientId: 'client-abc',
      secret: 'wrong-secret',
      environment: 'sandbox',
    })

    expect(result).toEqual({ ok: false, errorCode: 'INVALID_API_KEYS', message: "Couldn't verify these keys" })
  })

  it('save() persists credentials only after a successful test', async () => {
    itemGet.mockResolvedValue({ data: {} })
    repoMock.upsert.mockResolvedValue(undefined)
    const { plaidCredentialService } = await import('./plaidCredentialService.js')

    const result = await plaidCredentialService.save('user-1', {
      clientId: 'client-abc',
      secret: 'secret-abc',
      environment: 'sandbox',
    })

    expect(repoMock.upsert).toHaveBeenCalledWith({
      userId: 'user-1',
      clientId: 'client-abc',
      secret: 'secret-abc',
      environment: 'sandbox',
    })
    expect(result).toEqual({ ok: true })
  })

  it('save() does not persist when the test call fails', async () => {
    itemGet.mockRejectedValue({ response: { data: { error_code: 'INVALID_API_KEYS', error_message: 'bad keys' } } })
    const { plaidCredentialService } = await import('./plaidCredentialService.js')

    const result = await plaidCredentialService.save('user-1', {
      clientId: 'client-abc',
      secret: 'wrong',
      environment: 'sandbox',
    })

    expect(repoMock.upsert).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
  })

  it('get() returns the masked view, never the plaintext secret', async () => {
    repoMock.getMasked.mockResolvedValue({ clientId: 'client-abc', environment: 'sandbox', hasSecret: true })
    const { plaidCredentialService } = await import('./plaidCredentialService.js')

    const result = await plaidCredentialService.get('user-1')

    expect(result).toEqual({ clientId: 'client-abc', environment: 'sandbox', hasSecret: true })
  })
})
