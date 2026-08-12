import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
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

export function createApiClient() {
  return api.createClient({
    links: [
      httpBatchLink({
        url: `${resolveApiUrl()}/trpc`,
        headers: async () => {
          const { data } = await supabaseAuth.auth.getSession()
          const token = data.session?.access_token
          return token ? { Authorization: `Bearer ${token}` } : {}
        },
      }),
    ],
  })
}
