/**
 * Recognizes a connectivity-shaped failure talking to Supabase (Postgres or PostgREST) so it can
 * be tagged distinctly from an application bug — the whole reason this exists is the incident
 * where a Supabase-side outage logged as a bare INTERNAL_SERVER_ERROR, indistinguishable from a
 * real defect in our own code.
 *
 * Deliberately narrow: this matches "the call never really completed" (a dropped connection, a
 * timeout, DNS failure), not "the call completed and Postgres/PostgREST rejected it" (a bad
 * query, an RLS violation, a constraint conflict) — those are still our own bugs to log as such.
 * The direct `postgres` driver (backend/src/lib/db/client.ts) throws Node's own network error
 * codes on a dropped connection; PostgREST calls (getScopedClient) surface a fetch failure as a
 * message rather than a code, so both shapes are checked.
 */
const NETWORK_ERROR_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN', 'EPIPE'])

const NETWORK_MESSAGE_PATTERNS = [/fetch failed/i, /network/i, /socket hang up/i, /connect timeout/i, /other side closed/i, /timed? ?out/i]

export interface SupabaseErrorDetail {
  matched: boolean
  /** The code or message fragment that matched — kept for the log line, not for branching on. */
  reason?: string
}

export function supabaseErrorOf(err: unknown): SupabaseErrorDetail {
  const code = (err as { code?: string })?.code
  if (code && NETWORK_ERROR_CODES.has(code)) return { matched: true, reason: code }

  const message = err instanceof Error ? err.message : typeof (err as { message?: unknown })?.message === 'string' ? (err as { message: string }).message : undefined
  if (message && NETWORK_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return { matched: true, reason: message }
  }

  return { matched: false }
}
