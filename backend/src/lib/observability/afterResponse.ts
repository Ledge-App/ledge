/**
 * Runs work that must finish but must not delay the response.
 *
 * On a serverless platform the invocation can be frozen the moment the response completes, so
 * anything not awaited is simply dropped — which is why the log flush was originally awaited
 * inside an onSend hook, putting the sink's round trip on every response. Vercel's `waitUntil`
 * is the primitive that resolves that: it keeps the invocation alive past the response without
 * holding it open.
 *
 * The fallback is the important part. Where `waitUntil` does not exist — local runs, tests, or a
 * runtime that drops the export — this awaits instead. Silently discarding the work would be the
 * worst of the three outcomes, and it is the failure mode this module exists to rule out.
 */
type Scheduler = (work: Promise<unknown>) => void

// undefined = not yet resolved, null = unavailable here. Cached so the dynamic import below
// happens once per instance rather than once per request.
let scheduler: Scheduler | null | undefined

async function resolveScheduler(): Promise<Scheduler | null> {
  if (scheduler !== undefined) return scheduler
  if (!process.env.VERCEL) {
    scheduler = null
    return scheduler
  }
  try {
    // Imported lazily and by specifier so the module is only loaded where it can work; calling
    // waitUntil outside a Vercel request context throws.
    const mod: { waitUntil?: unknown } = await import('@vercel/functions')
    scheduler = typeof mod.waitUntil === 'function' ? (mod.waitUntil as Scheduler) : null
  } catch {
    scheduler = null
  }
  return scheduler
}

export async function runAfterResponse(work: Promise<void>): Promise<void> {
  const schedule = await resolveScheduler()
  if (schedule) {
    schedule(work)
    return
  }
  await work
}

export function resetSchedulerForTests(): void {
  scheduler = undefined
}
