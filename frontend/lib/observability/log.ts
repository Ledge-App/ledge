/**
 * The app's one place for reporting a failure nobody is watching.
 *
 * Originally just the automatic paths — the background wake, auto-applied transfers, the
 * orphan sweep, a corrupt cache entry — which are caught, handled correctly, and then
 * invisible. Also now called from interactive auth failures (lib/supabase/auth.ts): a platform
 * outage on the sign-in provider needs the same off-device visibility a background failure
 * does, and "the user will complain" doesn't reliably surface that at the scale that matters —
 * a handful of complaints looks identical to isolated bad luck without an aggregate count.
 *
 * `console.error` reaches the Metro console in development and the device log (Console.app,
 * `adb logcat`) in a release build. `reportClientError` (observability router, backend) is the
 * actual off-device destination — the same Axiom sink the backend's own errors ship to, so an
 * incident shows up in one place regardless of which side of the app noticed it first. It is
 * fire-and-forget and can never throw or block the caller: a broken reporting path must never
 * become the reason the original failure wasn't handled.
 *
 * Detail must never carry financial data. Amounts, merchant names and raw transaction bodies
 * stay out of it (architecture.md's on-device boundary); ids and counts are what make a line
 * actionable anyway — and detail never reaches the remote sink at all, only `scope` and the
 * error's own message/name, keeping that boundary structurally true rather than reviewer-enforced.
 */
export function reportError(scope: string, error: unknown, detail?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error)
  const parts: unknown[] = [`[${scope}] ${message}`]
  if (detail && Object.keys(detail).length > 0) parts.push(detail)
  // The Error itself last, so a console that renders stacks still has one to render.
  if (error instanceof Error) parts.push(error)
  console.error(...parts)

  // Deliberately not awaited and wrapped so a network failure while reporting a network
  // failure can't compound into an unhandled rejection — see the module doc above.
  void reportRemote(scope, message, error instanceof Error ? error.name : undefined)
}

async function reportRemote(scope: string, message: string, name: string | undefined): Promise<void> {
  try {
    const { createHeadlessApiClient } = await import('@/lib/api/client')
    await createHeadlessApiClient().observability.reportClientError.mutate({ scope, message, name })
  } catch {
    // The sink itself is down, or the device is offline — already on the console above, and
    // there is nowhere further to escalate to.
  }
}
