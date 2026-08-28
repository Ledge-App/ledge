import { Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildServer } from './server.js'
import { bufferErrorEvent } from './lib/observability/requestErrorBuffer.js'
import { FLUSH_AT, resetQueue } from './lib/observability/eventQueue.js'

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


  describe('axiom shipping', () => {
    beforeEach(() => {
      resetQueue()
      process.env.AXIOM_TOKEN = 'xaat-test-token'
      process.env.AXIOM_DATASET = 'tofi-backend'
    })

    afterEach(() => {
      resetQueue()
      delete process.env.AXIOM_TOKEN
      delete process.env.AXIOM_DATASET
      vi.unstubAllGlobals()
    })

    function okFetch() {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' })
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }

    it('batches successful requests instead of sending on each one', async () => {
      const fetchMock = okFetch()
      const server = buildServer({ logDestination: logCollector().stream })

      for (let i = 0; i < FLUSH_AT - 1; i++) {
        await server.inject({ method: 'GET', url: '/health' })
      }
      // The flush is awaited while the response is open, so a send on every request would put
      // the sink's round trip on every response the app makes.
      expect(fetchMock).not.toHaveBeenCalled()

      await server.inject({ method: 'GET', url: '/health' })
      await server.close()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const batch = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(batch).toHaveLength(FLUSH_AT)
      expect(batch[0].level).toBe('info')
      expect(batch[0].http).toMatchObject({ method: 'GET', path: '/health', statusCode: 200 })
      expect(batch[0].http.durationMs).toEqual(expect.any(Number))
    })

    it('flushes immediately when a request raised an error, taking the queue with it', async () => {
      process.env.SUPABASE_JWT_SECRET = 'test-secret'
      const fetchMock = okFetch()
      const server = buildServer({ logDestination: logCollector().stream })

      // Two healthy requests accumulate, then a rejection forces everything out — an incident
      // must not sit in a half-full batch waiting for traffic that may never come.
      await server.inject({ method: 'GET', url: '/health' })
      await server.inject({ method: 'GET', url: '/health' })
      expect(fetchMock).not.toHaveBeenCalled()

      const response = await server.inject({ method: 'GET', url: '/trpc/categories.list' })
      await server.close()

      expect(response.statusCode).toBe(401)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const batch = JSON.parse(fetchMock.mock.calls[0][1].body)
      // Two health requests, the tRPC error, and the tRPC request itself.
      expect(batch).toHaveLength(4)
      const error = batch.find((e: { trpc?: object }) => e.trpc)
      expect(error.level).toBe('warn')
      expect(error.trpc).toEqual({ path: 'categories.list', type: 'query', code: 'UNAUTHORIZED' })
      expect(error.err.message).toBe('UNAUTHORIZED')
    })

    it('sends inside the invocation, not after the response', async () => {
      let sentBeforeResponse = false
      const fetchMock = vi.fn().mockImplementation(async () => {
        sentBeforeResponse = true
        return { ok: true, status: 200, text: async () => '' }
      })
      vi.stubGlobal('fetch', fetchMock)

      const server = buildServer({ logDestination: logCollector().stream })
      // A probe route rather than a failing procedure: every procedure that fails without a
      // database is a rejection, and one is exercised above. This isolates the hook itself.
      server.get('/probe-buffered-error', async (request) => {
        bufferErrorEvent(request, { probe: true })
        return { ok: true }
      })

      const response = await server.inject({ method: 'GET', url: '/probe-buffered-error' })
      await server.close()

      // inject resolves once the response is complete, so the send having already happened is
      // what proves the flush runs inside the invocation rather than after it — the distinction
      // that decides whether it survives on a serverless platform at all.
      expect(sentBeforeResponse).toBe(true)
      expect(response.statusCode).toBe(200)
      const batch = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(batch[0]).toEqual({ probe: true })
      expect(batch[1].http.path).toBe('/probe-buffered-error')
    })

    it('never ships the query string, where a batched query carries its input', async () => {
      process.env.SUPABASE_JWT_SECRET = 'test-secret'
      const fetchMock = okFetch()
      const server = buildServer({ logDestination: logCollector().stream })

      await server.inject({
        method: 'GET',
        url: '/trpc/transactions.sync?batch=1&input=%7B%220%22%3A%7B%22cursors%22%3A%7B%22item-1%22%3A%22SECRET%22%7D%7D%7D',
      })
      await server.close()

      expect(JSON.stringify(JSON.parse(fetchMock.mock.calls[0][1].body))).not.toContain('SECRET')
    })

    it('sends nothing at all when the sink is not configured', async () => {
      delete process.env.AXIOM_TOKEN
      delete process.env.AXIOM_DATASET
      process.env.SUPABASE_JWT_SECRET = 'test-secret'
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      const logs = logCollector()
      const server = buildServer({ logDestination: logs.stream })
      await server.inject({ method: 'GET', url: '/trpc/categories.list' })
      await server.close()

      // Local development and CI must not need credentials, and must not make network calls.
      expect(fetchMock).not.toHaveBeenCalled()
      expect(logs.text()).toContain('trpc request rejected')
    })
  })

})
