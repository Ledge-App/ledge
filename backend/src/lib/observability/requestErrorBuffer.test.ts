import { describe, expect, it } from 'vitest'
import { bufferErrorEvent, takeErrorEvents } from './requestErrorBuffer.js'

describe('requestErrorBuffer', () => {
  it('collects every event raised for one request', () => {
    const request = {}
    // A batched request can fail in more than one procedure, and each one matters.
    bufferErrorEvent(request, { path: 'categories.list' })
    bufferErrorEvent(request, { path: 'budgets.list' })

    expect(takeErrorEvents(request)).toEqual([{ path: 'categories.list' }, { path: 'budgets.list' }])
  })

  it('keeps requests separate', () => {
    const a = {}
    const b = {}
    bufferErrorEvent(a, { path: 'a' })
    bufferErrorEvent(b, { path: 'b' })

    expect(takeErrorEvents(a)).toEqual([{ path: 'a' }])
    expect(takeErrorEvents(b)).toEqual([{ path: 'b' }])
  })

  it('empties on take, so a flush cannot send the same event twice', () => {
    const request = {}
    bufferErrorEvent(request, { path: 'a' })

    expect(takeErrorEvents(request)).toHaveLength(1)
    expect(takeErrorEvents(request)).toEqual([])
  })

  it('returns an empty list for a request that never failed', () => {
    expect(takeErrorEvents({})).toEqual([])
  })
})
