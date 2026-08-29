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

// Only for a fetch that never got a response at all — DNS failure, dropped connection, exactly
// what "network connection was lost" is (the incident this exists for). A resolved response,
// even a 500, is a real application-level result and is never retried here: retrying that would
// mean guessing whether the server already processed the request, and for a mutation that guess
// can manufacture a duplicate write. React Query's own retry (queries: 3, exponential — mutations
// deliberately 0, see app/_layout.tsx) already governs that case correctly on its own.
const NETWORK_RETRY_ATTEMPTS = 2
const NETWORK_RETRY_BASE_MS = 300
const NETWORK_RETRY_CAP_MS = 2_000

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
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init)
    } catch (err) {
      if (attempt >= NETWORK_RETRY_ATTEMPTS) throw err
      await new Promise((resolve) => setTimeout(resolve, jitteredBackoffMs(attempt)))
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
