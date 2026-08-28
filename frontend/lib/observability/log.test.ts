import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError } from './log'

describe('reportError', () => {
  afterEach(() => vi.restoreAllMocks())

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
})
