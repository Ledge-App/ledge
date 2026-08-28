import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { buildServer } from './server.js'

/** Collects everything the server logs during one request. */
function logCollector() {
  const lines: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk))
      callback()
    },
  })
  return { stream, text: () => lines.join('') }
}

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

  it('logs the procedure and code when a tRPC request is rejected', async () => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret'
    const logs = logCollector()
    const server = buildServer({ logDestination: logs.stream })
    await server.inject({ method: 'GET', url: '/trpc/categories.list' })
    await server.close()

    // Before the onError hook this request left behind nothing but a status code: tRPC answers
    // its own errors, so they never reach Fastify's error handler.
    expect(logs.text()).toContain('trpc request rejected')
    expect(logs.text()).toContain('"path":"categories.list"')
    expect(logs.text()).toContain('"code":"UNAUTHORIZED"')
  })

  it('logs each failing procedure in a batch separately, since the batch has one status', async () => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret'
    const logs = logCollector()
    const server = buildServer({ logDestination: logs.stream })
    const response = await server.inject({
      method: 'GET',
      url: '/trpc/categories.list,budgets.list?batch=1&input=%7B%7D',
    })
    await server.close()

    // A batch collapses to a single status — 401 here because every member failed the same way,
    // and 207 Multi-Status as soon as they differ. Neither says which procedure broke, which is
    // why per-procedure logging is the only reliable signal.
    expect(response.statusCode).toBe(401)
    expect(logs.text()).toContain('"path":"categories.list"')
    expect(logs.text()).toContain('"path":"budgets.list"')
  })

})
