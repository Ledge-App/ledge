import { beforeEach, describe, expect, it, vi } from 'vitest'

const verifyJwt = vi.fn()
vi.mock('../middleware/requireAuth.js', () => ({ verifyJwt }))

const request = (authorization?: string) =>
  ({ req: { headers: { authorization } } }) as unknown as Parameters<
    Awaited<typeof import('./context.js')>['createContext']
  >[0]

describe('createContext', () => {
  beforeEach(() => vi.clearAllMocks())

  it('carries the verified email alongside the user id', async () => {
    verifyJwt.mockResolvedValue({ userId: 'user-1', email: 'dev@example.com' })
    const { createContext } = await import('./context.js')

    await expect(createContext(request('Bearer token-1'))).resolves.toEqual({
      userId: 'user-1',
      email: 'dev@example.com',
      jwt: 'token-1',
    })
  })

  it('yields a null email for an unauthenticated request', async () => {
    const { createContext } = await import('./context.js')

    await expect(createContext(request(undefined))).resolves.toEqual({ userId: null, email: null, jwt: null })
  })

  it('yields a null email when the token fails verification', async () => {
    verifyJwt.mockRejectedValue(new Error('bad signature'))
    const { createContext } = await import('./context.js')

    await expect(createContext(request('Bearer bad-token'))).resolves.toEqual({
      userId: null,
      email: null,
      jwt: null,
    })
  })
})
