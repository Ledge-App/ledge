/**
 * Holds the error events raised while answering one request, until the flush hook ships them.
 *
 * The indirection exists because tRPC's `onError` callback is fire-and-forget — its return value
 * is ignored, so an async version of it would not be awaited and the send would be dropped the
 * moment the serverless invocation froze. So `onError` only records, and an awaited Fastify hook
 * does the sending.
 *
 * A WeakMap keyed on the request rather than a Fastify decorator: no typing gymnastics, and
 * entries disappear with the request object they belong to.
 */
const buffers = new WeakMap<object, object[]>()

export function bufferErrorEvent(request: object, event: object): void {
  const existing = buffers.get(request)
  if (existing) {
    existing.push(event)
    return
  }
  buffers.set(request, [event])
}

/** Returns and clears the request's events; a batched request can hold several. */
export function takeErrorEvents(request: object): object[] {
  const events = buffers.get(request)
  if (!events) return []
  buffers.delete(request)
  return events
}
