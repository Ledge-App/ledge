/**
 * Decides whether the React Query cache must be emptied in response to an auth event.
 *
 * The cache is a single long-lived instance created once in `app/_layout.tsx`, so it
 * outlives any individual session. Without an explicit reset, signing out and signing in
 * as a different user on the same device leaves the previous user's query results in
 * memory, and they render for the new user. No request reaches Postgres in that case, so
 * RLS cannot prevent it — the boundary has to be enforced on-device.
 *
 * `previous` is the user the cache currently holds data for; `undefined` means no auth
 * event has been observed yet.
 */
export function shouldResetCache(previous: string | null | undefined, next: string | null): boolean {
  // First observation after mount (supabase-js emits INITIAL_SESSION on subscribe). The
  // cache is empty at that point, and clearing here would discard the first fetch of the
  // session — which is already in flight by the time the listener's effect runs.
  if (previous === undefined) return false

  // Ignore events that don't change identity. TOKEN_REFRESHED fires on a timer for the
  // whole session, and clearing on it would throw away good data repeatedly.
  return previous !== next
}
