import { createTRPCReact } from '@trpc/react-query'
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@/types/backend'
import { supabaseAuth } from '@/lib/supabase/auth'

export const api = createTRPCReact<AppRouter>()

// Every request carries the Supabase bearer token, and the Plaid setup flow sends the
// user's Plaid secret in the body — a plaintext API URL must never reach a release
// build. EXPO_PUBLIC_API_URL comes from EAS's remote environment at build time, so a
// bad value would otherwise ship without anything in this repo catching it.
function resolveApiUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL
  if (!url) throw new Error('EXPO_PUBLIC_API_URL is not set')
  if (!__DEV__ && !url.startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_API_URL must be https:// in release builds')
  }
  return url
}

// Only for a GET whose fetch rejected outright — a query, never a mutation. This is *not* the
// same guarantee as "the server never saw the request": React Native's fetch throws the same
// generic TypeError whether the connection failed before anything was sent or the connection
// dropped after the request body was fully delivered and only the response was lost. For a
// mutation those two cases are indistinguishable here, and retrying the second one risks a
// duplicate write against a non-idempotent insert (transfers.createMany, categories.create,
// manualTransactions.create — none carry an idempotency key). That risk is exactly what React
// Query's mutations: 0 retries (app/_layout.tsx) already refuses at the query-client layer; a
// blanket retry here would silently reinstate it one layer down. A GET is naturally repeatable
// regardless of which failure occurred, so it alone is safe to retry.
const NETWORK_RETRY_ATTEMPTS = 2
const NETWORK_RETRY_BASE_MS = 300
const NETWORK_RETRY_CAP_MS = 2_000

// Without this, a connection that never resolves — accepted, then stalled, by a captive
// portal or a wedged proxy — leaves `await fetch(...)` pending forever: `catch` never runs, so
// the retry loop below never engages either. 20s comfortably exceeds Vercel's default function
// duration, so a request that's genuinely still being processed on a healthy connection is
// never cut off before the server itself would have answered or timed out.
const FETCH_TIMEOUT_MS = 20_000

/**
 * "Full jitter" (AWS's name for it): a random delay between 0 and the exponential ceiling,
 * rather than the ceiling itself. A fixed schedule (wait exactly 300ms, then exactly 900ms)
 * means every device affected by the same outage retries at the same synchronized instants —
 * so the moment the backend recovers, every client hits it again at once, in a repeating clump.
 * Randomizing within the window spreads those same retries into a smooth trickle instead.
 */
export function jitteredBackoffMs(attempt: number): number {
  const ceiling = Math.min(NETWORK_RETRY_CAP_MS, NETWORK_RETRY_BASE_MS * 2 ** attempt)
  return Math.random() * ceiling
}

export async function fetchWithNetworkRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // httpBatchLink sends every query as GET and every mutation as POST/PUT/etc — an absent
  // method (a bare `undefined`) is fetch's own GET default, so it's treated the same way.
  const isIdempotent = (init?.method ?? 'GET').toUpperCase() === 'GET'
  const callerSignal = init?.signal
  for (let attempt = 0; ; attempt++) {
    // A fresh controller per attempt, chained to both our own timeout and the caller's signal
    // (react-query cancels a superseded/unmounted query this way) — so either one can cut this
    // attempt short, and we can tell which one did.
    const attemptController = new AbortController()
    const onCallerAbort = () => attemptController.abort()
    callerSignal?.addEventListener('abort', onCallerAbort)
    const timeoutId = setTimeout(() => attemptController.abort(), FETCH_TIMEOUT_MS)
    try {
      return await fetch(input, { ...init, signal: attemptController.signal })
    } catch (err) {
      // The caller cancelled this request on purpose (unmount, a superseded refetch) — that's
      // not a connectivity failure, and retrying would just re-fire work the caller already
      // decided to discard.
      if (callerSignal?.aborted) throw err
      if (!isIdempotent || attempt >= NETWORK_RETRY_ATTEMPTS) throw err
      await new Promise((resolve) => setTimeout(resolve, jitteredBackoffMs(attempt)))
    } finally {
      clearTimeout(timeoutId)
      callerSignal?.removeEventListener('abort', onCallerAbort)
    }
  }
}

function authedLinks() {
  return [
    httpBatchLink({
      url: `${resolveApiUrl()}/trpc`,
      fetch: fetchWithNetworkRetry,
      headers: async () => {
        const { data } = await supabaseAuth.auth.getSession()
        const token = data.session?.access_token
        return token ? { Authorization: `Bearer ${token}` } : {}
      },
    }),
  ]
}

export function createApiClient() {
  return api.createClient({ links: authedLinks() })
}

/**
 * Imperative client for code that runs outside the React tree — the background alert task has
 * no provider to hang the react-query client on. Same URL, same auth header, same batching.
 */
export function createHeadlessApiClient() {
  return createTRPCProxyClient<AppRouter>({ links: authedLinks() })
}
