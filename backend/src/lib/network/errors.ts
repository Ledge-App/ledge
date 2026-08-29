/**
 * Recognizes a connectivity-shaped failure — a call that never really completed (a dropped
 * connection, a timeout, DNS failure) rather than one that completed and got an application-level
 * error back (a bad query, an RLS violation, a constraint conflict, Postgres's own statement
 * timeout). The latter are still our own bugs to log as such.
 *
 * Deliberately NOT attributed to a specific downstream service. The direct `postgres` driver
 * (backend/src/lib/db/client.ts) and PostgREST (getScopedClient) can both throw a bare Node
 * network error code (ECONNREFUSED, ETIMEDOUT, ...) on a dropped connection, and so — in
 * principle — could any other outbound call this backend makes. A generic network error code or
 * message carries no signal about *which* call failed, only that one did; claiming it was
 * specifically Supabase would be a guess dressed up as a fact, and a wrong guess here sends an
 * on-call to the wrong dashboard. Tag it as what it verifiably is: a network-layer failure.
 *
 * The message list is intentionally narrow. Two broader patterns were tried and rejected:
 * a bare `/network/i` substring matches arbitrary unrelated text, and a generic
 * timeout pattern matched Postgres's own "canceling statement due to statement timeout"
 * (SQLSTATE 57014) — a slow query of ours, not a connectivity failure. `ETIMEDOUT` (the Node
 * error code for a connection that never completed) already covers the connectivity case
 * precisely; matching the word "timeout" in arbitrary error text does not.
 */
const NETWORK_ERROR_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN', 'EPIPE'])

const NETWORK_MESSAGE_PATTERNS = [/fetch failed/i, /network connection was lost/i, /socket hang up/i, /other side closed/i]

export interface NetworkErrorDetail {
  matched: boolean
  /** The code or message fragment that matched — kept for the log line, not for branching on. */
  reason?: string
}

export function networkErrorOf(err: unknown): NetworkErrorDetail {
  const code = (err as { code?: string })?.code
  if (code && NETWORK_ERROR_CODES.has(code)) return { matched: true, reason: code }

  const message = err instanceof Error ? err.message : typeof (err as { message?: unknown })?.message === 'string' ? (err as { message: string }).message : undefined
  if (message && NETWORK_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return { matched: true, reason: message }
  }

  return { matched: false }
}
