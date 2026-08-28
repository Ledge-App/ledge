import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function importAfterResponse() {
  vi.resetModules()
  return await import('./afterResponse.js')
}

/** A promise that only settles when told to, so tests can see whether it was awaited. */
function deferred() {
  let resolve!: () => void
  let settled = false
  const promise = new Promise<void>((r) => {
    resolve = () => {
      settled = true
      r()
    }
  })
  return { promise, resolve, settled: () => settled }
}

describe('runAfterResponse', () => {
  beforeEach(() => {
    delete process.env.VERCEL
    vi.resetModules()
  })

  afterEach(() => {
    delete process.env.VERCEL
    vi.doUnmock('@vercel/functions')
  })

  it('awaits the work when not running on Vercel', async () => {
    const { runAfterResponse } = await importAfterResponse()
    const work = deferred()

    let returned = false
    const call = runAfterResponse(work.promise).then(() => (returned = true))
    await Promise.resolve()

    // Local runs and tests have no invocation to keep alive, so the only way the work
    // completes is by being awaited. This is the fallback that must never silently rot.
    expect(returned).toBe(false)
    work.resolve()
    await call
    expect(returned).toBe(true)
  })

  it('hands the work to waitUntil on Vercel without awaiting it', async () => {
    const waitUntil = vi.fn()
    vi.doMock('@vercel/functions', () => ({ waitUntil }))
    process.env.VERCEL = '1'
    const { runAfterResponse } = await importAfterResponse()
    const work = deferred()

    await runAfterResponse(work.promise)

    // The whole point: the response is released while the send is still in flight.
    expect(work.settled()).toBe(false)
    expect(waitUntil).toHaveBeenCalledWith(work.promise)
  })

  it('falls back to awaiting when the platform offers no waitUntil', async () => {
    // A runtime where the export is missing must not silently drop the work — that failure
    // mode is why batching was chosen over waitUntil in the first place, and it is the one
    // thing this module exists to rule out.
    vi.doMock('@vercel/functions', () => ({}))
    process.env.VERCEL = '1'
    const { runAfterResponse } = await importAfterResponse()
    const work = deferred()

    let returned = false
    const call = runAfterResponse(work.promise).then(() => (returned = true))
    await Promise.resolve()

    expect(returned).toBe(false)
    work.resolve()
    await call
    expect(returned).toBe(true)
  })

  it('resolves the scheduler once and reuses it', async () => {
    const waitUntil = vi.fn()
    vi.doMock('@vercel/functions', () => ({ waitUntil }))
    process.env.VERCEL = '1'
    const { runAfterResponse } = await importAfterResponse()

    await runAfterResponse(Promise.resolve())
    await runAfterResponse(Promise.resolve())

    // Cached, so the dynamic import is not repeated on every request.
    expect(waitUntil).toHaveBeenCalledTimes(2)
  })
})
