import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = {
  upsert: vi.fn(),
  getDecrypted: vi.fn(),
  getMasked: vi.fn(),
}
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: repoMock }))

const devEmailMock = { isAllowed: vi.fn() }
vi.mock('../repositories/devEmailRepository.js', () => ({ devEmailRepository: devEmailMock }))

const itemGet = vi.fn()
const createPlaidClient = vi.fn(() => ({ itemGet }))
vi.mock('../lib/plaid/client.js', () => ({ createPlaidClient }))

const NON_DEV = { userId: 'user-1', email: 'user@example.com' }
const DEV = { userId: 'dev-1', email: 'dev@example.com' }

describe('plaidCredentialService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    devEmailMock.isAllowed.mockResolvedValue(false)
    repoMock.getDecrypted.mockResolvedValue(null)
    itemGet.mockResolvedValue({ data: {} })
  })

  describe('allowedEnvironments', () => {
    it('offers production only to a non-allowlisted user', async () => {
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      await expect(plaidCredentialService.allowedEnvironments(NON_DEV.email)).resolves.toEqual(['production'])
    })

    it('offers both environments to an allowlisted dev', async () => {
      devEmailMock.isAllowed.mockResolvedValue(true)
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      await expect(plaidCredentialService.allowedEnvironments(DEV.email)).resolves.toEqual([
        'production',
        'sandbox',
      ])
    })

    it('offers production only when the token carries no email', async () => {
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      await expect(plaidCredentialService.allowedEnvironments(null)).resolves.toEqual(['production'])
    })
  })

  describe('test()', () => {
    it('reports success when Plaid accepts the credentials', async () => {
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.test(NON_DEV.userId, NON_DEV.email, {
        clientId: 'client-abc',
        secret: 'secret-abc',
        environment: 'production',
      })

      expect(result).toEqual({ ok: true })
    })

    it('refuses to probe sandbox for a non-allowlisted user with no saved keys', async () => {
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.test(NON_DEV.userId, NON_DEV.email, {
        clientId: 'client-abc',
        secret: 'secret-abc',
        environment: 'sandbox',
      })

      expect(result).toEqual({
        ok: false,
        errorCode: 'ENVIRONMENT_NOT_ALLOWED',
        message: 'This account can only use production Plaid keys.',
      })
      expect(itemGet).not.toHaveBeenCalled()
    })

    it('probes sandbox for an allowlisted dev', async () => {
      devEmailMock.isAllowed.mockResolvedValue(true)
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.test(DEV.userId, DEV.email, {
        clientId: 'client-abc',
        secret: 'secret-abc',
        environment: 'sandbox',
      })

      expect(result).toEqual({ ok: true })
    })

    it('reports the specific Plaid error on failure', async () => {
      itemGet.mockRejectedValue({
        response: { data: { error_code: 'INVALID_API_KEYS', error_message: "Couldn't verify these keys" } },
      })
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.test(NON_DEV.userId, NON_DEV.email, {
        clientId: 'client-abc',
        secret: 'wrong-secret',
        environment: 'production',
      })

      expect(result).toEqual({ ok: false, errorCode: 'INVALID_API_KEYS', message: "Couldn't verify these keys" })
    })

    it('tests a rotation against the stored environment and client id, not the input', async () => {
      repoMock.getDecrypted.mockResolvedValue({
        clientId: 'stored-client',
        secret: 'old-secret',
        environment: 'sandbox',
      })
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      await plaidCredentialService.test(DEV.userId, DEV.email, {
        clientId: 'attacker-client',
        secret: 'new-secret',
        environment: 'production',
      })

      expect(createPlaidClient).toHaveBeenCalledWith('stored-client', 'new-secret', 'sandbox')
    })
  })

  describe('save() — first time', () => {
    it('persists production for a non-allowlisted user', async () => {
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.save(NON_DEV.userId, NON_DEV.email, {
        clientId: 'client-abc',
        secret: 'secret-abc',
        environment: 'production',
      })

      expect(result).toEqual({ ok: true })
      expect(repoMock.upsert).toHaveBeenCalledWith({
        userId: NON_DEV.userId,
        clientId: 'client-abc',
        secret: 'secret-abc',
        environment: 'production',
      })
    })

    it('refuses sandbox for a non-allowlisted user', async () => {
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.save(NON_DEV.userId, NON_DEV.email, {
        clientId: 'client-abc',
        secret: 'secret-abc',
        environment: 'sandbox',
      })

      expect(result).toEqual({
        ok: false,
        errorCode: 'ENVIRONMENT_NOT_ALLOWED',
        message: 'This account can only use production Plaid keys.',
      })
      expect(repoMock.upsert).not.toHaveBeenCalled()
    })

    it('does not reach Plaid at all when the environment is refused', async () => {
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      await plaidCredentialService.save(NON_DEV.userId, NON_DEV.email, {
        clientId: 'client-abc',
        secret: 'secret-abc',
        environment: 'sandbox',
      })

      expect(itemGet).not.toHaveBeenCalled()
    })

    it('persists sandbox for an allowlisted dev', async () => {
      devEmailMock.isAllowed.mockResolvedValue(true)
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.save(DEV.userId, DEV.email, {
        clientId: 'client-abc',
        secret: 'secret-abc',
        environment: 'sandbox',
      })

      expect(result).toEqual({ ok: true })
      expect(repoMock.upsert).toHaveBeenCalledWith(expect.objectContaining({ environment: 'sandbox' }))
    })

    it('does not persist when the Plaid test call fails', async () => {
      itemGet.mockRejectedValue({ response: { data: { error_code: 'INVALID_API_KEYS', error_message: 'bad keys' } } })
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.save(NON_DEV.userId, NON_DEV.email, {
        clientId: 'client-abc',
        secret: 'wrong',
        environment: 'production',
      })

      expect(result.ok).toBe(false)
      expect(repoMock.upsert).not.toHaveBeenCalled()
    })
  })

  describe('save() — rotation', () => {
    beforeEach(() => {
      repoMock.getDecrypted.mockResolvedValue({
        clientId: 'stored-client',
        secret: 'old-secret',
        environment: 'production',
      })
    })

    it('rotates the secret while keeping environment and client id', async () => {
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.save(NON_DEV.userId, NON_DEV.email, {
        clientId: 'stored-client',
        secret: 'new-secret',
        environment: 'production',
      })

      expect(result).toEqual({ ok: true })
      expect(repoMock.upsert).toHaveBeenCalledWith({
        userId: NON_DEV.userId,
        clientId: 'stored-client',
        secret: 'new-secret',
        environment: 'production',
      })
    })

    it('refuses a change of environment', async () => {
      devEmailMock.isAllowed.mockResolvedValue(true)
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.save(DEV.userId, DEV.email, {
        clientId: 'stored-client',
        secret: 'new-secret',
        environment: 'sandbox',
      })

      expect(result).toEqual({
        ok: false,
        errorCode: 'ENVIRONMENT_LOCKED',
        message: 'The Plaid environment is fixed once keys are saved and cannot be changed.',
      })
      expect(repoMock.upsert).not.toHaveBeenCalled()
    })

    it('refuses a change of client id', async () => {
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.save(NON_DEV.userId, NON_DEV.email, {
        clientId: 'a-different-client',
        secret: 'new-secret',
        environment: 'production',
      })

      expect(result).toEqual({
        ok: false,
        errorCode: 'CLIENT_ID_LOCKED',
        message: 'The Plaid client ID is fixed once keys are saved and cannot be changed.',
      })
      expect(repoMock.upsert).not.toHaveBeenCalled()
    })

    it('verifies the new secret against the stored environment before persisting', async () => {
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      await plaidCredentialService.save(NON_DEV.userId, NON_DEV.email, {
        clientId: 'stored-client',
        secret: 'new-secret',
        environment: 'production',
      })

      expect(createPlaidClient).toHaveBeenCalledWith('stored-client', 'new-secret', 'production')
    })

    it('leaves an allowlisted dev locked into the environment they first chose', async () => {
      repoMock.getDecrypted.mockResolvedValue({
        clientId: 'stored-client',
        secret: 'old-secret',
        environment: 'sandbox',
      })
      devEmailMock.isAllowed.mockResolvedValue(true)
      const { plaidCredentialService } = await import('./plaidCredentialService.js')

      const result = await plaidCredentialService.save(DEV.userId, DEV.email, {
        clientId: 'stored-client',
        secret: 'new-secret',
        environment: 'production',
      })

      expect(result.ok).toBe(false)
      expect(repoMock.upsert).not.toHaveBeenCalled()
    })
  })

  it('get() returns the masked view, never the plaintext secret', async () => {
    repoMock.getMasked.mockResolvedValue({ clientId: 'client-abc', environment: 'production', hasSecret: true })
    const { plaidCredentialService } = await import('./plaidCredentialService.js')

    const result = await plaidCredentialService.get('user-1')

    expect(result).toEqual({ clientId: 'client-abc', environment: 'production', hasSecret: true })
  })
})
