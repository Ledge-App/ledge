import { beforeEach, describe, expect, it } from 'vitest'
import { FLUSH_AT, enqueue, queueSize, resetQueue, takeAll, takeIfFull } from './eventQueue.js'

describe('eventQueue', () => {
  beforeEach(() => resetQueue())

  it('holds events without releasing them until the batch is full', () => {
    for (let i = 0; i < FLUSH_AT - 1; i++) enqueue([{ n: i }])

    // The point of the queue: most requests append and return, paying nothing for the sink.
    expect(takeIfFull()).toEqual([])
    expect(queueSize()).toBe(FLUSH_AT - 1)
  })

  it('releases the whole batch once it is full, and empties', () => {
    for (let i = 0; i < FLUSH_AT; i++) enqueue([{ n: i }])

    const batch = takeIfFull()
    expect(batch).toHaveLength(FLUSH_AT)
    expect(queueSize()).toBe(0)
    expect(takeIfFull()).toEqual([])
  })

  it('releases everything on demand regardless of size, for the error path', () => {
    enqueue([{ n: 0 }, { n: 1 }])

    // An error must not sit in a half-full batch waiting for traffic that may never come.
    expect(takeAll()).toEqual([{ n: 0 }, { n: 1 }])
    expect(queueSize()).toBe(0)
  })

  it('accepts several events from one request', () => {
    // A batched tRPC call can raise several errors and still be one request.
    enqueue([{ n: 0 }, { n: 1 }, { n: 2 }])
    expect(queueSize()).toBe(3)
  })

  it('ignores an empty enqueue', () => {
    enqueue([])
    expect(queueSize()).toBe(0)
  })

  it('flushes often enough that a low-traffic instance is not sitting on stale events', () => {
    // Nothing can flush a partial batch on a frozen serverless instance — no timer runs — so
    // the threshold is the only guard against events aging out. Keep it small.
    expect(FLUSH_AT).toBeLessThanOrEqual(10)
  })
})
