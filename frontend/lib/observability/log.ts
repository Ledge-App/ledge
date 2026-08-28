/**
 * The app's one place for reporting a failure nobody is watching.
 *
 * Interactive failures already surface as UI state (a save error, a link error), so they need
 * nothing from here. This is for the automatic paths — the background wake, auto-applied
 * transfers, the orphan sweep, a corrupt cache entry — which are caught, handled correctly, and
 * then invisible. A user cannot report what they never saw, and there was no other trace: the
 * app had no console call and no crash reporter anywhere.
 *
 * `console.error` reaches the Metro console in development and the device log (Console.app,
 * `adb logcat`) in a release build, which is as far as visibility goes without a reporting
 * service. Wiring one in — Sentry's Expo SDK being the obvious candidate — means adding its
 * capture call to this function and nothing else.
 *
 * Detail must never carry financial data. Amounts, merchant names and raw transaction bodies
 * stay out of it (architecture.md's on-device boundary); ids and counts are what make a line
 * actionable anyway.
 */
export function reportError(scope: string, error: unknown, detail?: Record<string, unknown>): void {
  const message = error instanceof Error ? error.message : String(error)
  const parts: unknown[] = [`[${scope}] ${message}`]
  if (detail && Object.keys(detail).length > 0) parts.push(detail)
  // The Error itself last, so a console that renders stacks still has one to render.
  if (error instanceof Error) parts.push(error)
  console.error(...parts)
}
