/**
 * Accumulates events across requests so most responses do not wait on the sink.
 *
 * The flush is awaited while a response is still open — the only point at which a send is
 * guaranteed to complete on a serverless platform (see the onSend hook in server.ts). Sending on
 * every request would therefore put the sink's round trip on every response, which for an app
 * that batches a dozen queries per screen is a cost the user feels. Batching moves that to one
 * request in FLUSH_AT; the rest append to an array and return.
 *
 * The tradeoff, stated plainly: a partial batch lives in the memory of one warm instance. If the
 * platform evicts that instance rather than reusing it, those events are gone. Nothing can flush
 * them on the way out — a frozen invocation runs no timers and gets no shutdown hook. So request
 * telemetry here is best-effort by construction.
 *
 * Error events are not subject to that. The hook takes the whole queue whenever a request raised
 * one, so an error is never left waiting for traffic that may never arrive.
 */

/**
 * Small on purpose. The threshold is the only thing that bounds how long an event can sit
 * unsent, and this backend serves a handful of users — a large batch would routinely go stale.
 */
export const FLUSH_AT = 10

let queue: object[] = []

export function enqueue(events: object[]): void {
  if (events.length === 0) return
  queue.push(...events)
}

export function queueSize(): number {
  return queue.length
}

/** Returns and clears the queue only once it has reached FLUSH_AT; otherwise returns nothing. */
export function takeIfFull(): object[] {
  if (queue.length < FLUSH_AT) return []
  return takeAll()
}

/** Returns and clears the queue whatever its size. Used when a request raised an error. */
export function takeAll(): object[] {
  const batch = queue
  queue = []
  return batch
}

export function resetQueue(): void {
  queue = []
}
