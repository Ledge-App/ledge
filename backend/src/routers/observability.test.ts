import { describe, expect, it, vi } from 'vitest'

const sendToAxiomMock = vi.fn().mockResolvedValue(undefined)
vi.mock('../lib/observability/axiom.js', () => ({ sendToAxiom: sendToAxiomMock }))

describe('observability router', () => {
  it('accepts a client error report with no session at all', async () => {
    const { observabilityRouter } = await import('./observability.js')
    // Public procedure: an empty context is exactly what a failed sign-in has.
    const caller = observabilityRouter.createCaller({} as never)

    const result = await caller.reportClientError({ scope: 'auth-sign-in', message: 'fetch failed', name: 'TypeError' })

    expect(result).toEqual({ ok: true })
  })

  it('forwards the report to Axiom tagged as the frontend service', async () => {
    sendToAxiomMock.mockClear()
    const { observabilityRouter } = await import('./observability.js')
    const caller = observabilityRouter.createCaller({} as never)

    await caller.reportClientError({ scope: 'auth-sign-in', message: 'The network connection was lost.' })

    expect(sendToAxiomMock).toHaveBeenCalledTimes(1)
    const [events] = sendToAxiomMock.mock.calls[0]
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      service: 'tofi-frontend',
      level: 'error',
      scope: 'auth-sign-in',
      err: { type: 'Error', message: 'The network connection was lost.' },
    })
  })

  it('rejects an empty scope or message rather than logging a blank line', async () => {
    const { observabilityRouter } = await import('./observability.js')
    const caller = observabilityRouter.createCaller({} as never)

    await expect(caller.reportClientError({ scope: '', message: 'x' })).rejects.toThrow()
    await expect(caller.reportClientError({ scope: 'x', message: '' })).rejects.toThrow()
  })
})
