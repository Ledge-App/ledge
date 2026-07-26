import { describe, expect, it } from 'vitest'
import { buildServer } from './server.js'

describe('server', () => {
  it('responds 401 on a protected tRPC route with no Authorization header', async () => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret'
    const server = buildServer()
    const response = await server.inject({ method: 'GET', url: '/trpc/categories.list' })
    expect(response.statusCode).toBe(401)
    await server.close()
  })

  it('responds 200 on the health check with no auth required', async () => {
    const server = buildServer()
    const response = await server.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    await server.close()
  })
})
