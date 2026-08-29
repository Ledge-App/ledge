import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError } from './log'

const mutateMock = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/api/client', () => ({
  createHeadlessApiClient: () => ({ observability: { reportClientError: { mutate: mutateMock } } }),
}))

/** reportRemote is fire-and-forget — give its dynamic import + mutate call a tick to run. */
async function flushMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('reportError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    mutateMock.mockClear()
  })

  it('reports the scope and the error message together', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError('budget-alert-task', new Error('network unreachable'))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('[budget-alert-task] network unreachable')
    // The Error object is passed through so a console that renders stacks has one.
    expect(spy.mock.calls[0][1]).toBeInstanceOf(Error)
  })

  it('includes structured detail when given, and omits the argument when not', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError('transaction-cache', new Error('bad json'), { itemId: 'item-1' })
    expect(spy.mock.calls[0][1]).toEqual({ itemId: 'item-1' })

    reportError('transaction-cache', new Error('bad json'), {})
    expect(spy.mock.calls[1][1]).toBeInstanceOf(Error)
  })

  it('handles a thrown non-Error without losing the value', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError('orphan-sweep', 'plain string rejection')
    expect(spy.mock.calls[0][0]).toBe('[orphan-sweep] plain string rejection')
  })

  it('also forwards the scope and message to the remote sink', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // A scope unique to this test: the remote leg is throttled per scope (see below), and
    // reusing a scope another test already reported would silently no-op here.
    reportError('auth-sign-in-forward-test', new Error('fetch failed'))
    await flushMicrotasks()

    expect(mutateMock).toHaveBeenCalledWith({ scope: 'auth-sign-in-forward-test', message: 'fetch failed', name: 'Error' })
  })

  it('never lets a broken remote sink surface as an unhandled rejection', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mutateMock.mockRejectedValueOnce(new Error('sink unreachable'))

    expect(() => reportError('auth-sign-in-broken-sink-test', new Error('fetch failed'))).not.toThrow()
    await flushMicrotasks() // the rejection resolves quietly inside reportRemote's own catch
  })

  it('throttles repeated remote reports for the same scope', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Simulates a corrupted cache hitting many items in a loop (mmkv.ts, TransactionFeedProvider's
    // orphan sweep): the same scope, fired repeatedly, in a tight loop.
    for (let i = 0; i < 200; i++) {
      reportError('transaction-cache-throttle-test', new Error(`bad json for item ${i}`))
    }
    await flushMicrotasks()

    expect(mutateMock).toHaveBeenCalledTimes(1)
  })

  it('does not throttle across different scopes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    // Awaited separately rather than fired back-to-back: two concurrent first-time dynamic
    // imports of the same specifier is its own (unrelated) source of flakiness under Vitest's
    // module runner, and isn't what this test is about — it's the per-scope key, not timing.
    reportError('scope-a-throttle-test', new Error('boom a'))
    await flushMicrotasks()
    reportError('scope-b-throttle-test', new Error('boom b'))
    await flushMicrotasks()

    expect(mutateMock).toHaveBeenCalledTimes(2)
  })

  it('reports again once the throttle window has passed', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    reportError('window-elapsed-throttle-test', new Error('first'))
    await vi.advanceTimersByTimeAsync(0)
    reportError('window-elapsed-throttle-test', new Error('second, still inside the window'))
    await vi.advanceTimersByTimeAsync(0)
    expect(mutateMock).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_001)
    reportError('window-elapsed-throttle-test', new Error('third, window has passed'))
    await vi.advanceTimersByTimeAsync(0)

    expect(mutateMock).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
