import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@/types/backend'
import { supabaseAuth } from '@/lib/supabase/auth'

export const api = createTRPCReact<AppRouter>()

export function createApiClient() {
  return api.createClient({
    links: [
      httpBatchLink({
        url: `${process.env.EXPO_PUBLIC_API_URL}/trpc`,
        headers: async () => {
          const { data } = await supabaseAuth.auth.getSession()
          const token = data.session?.access_token
          return token ? { Authorization: `Bearer ${token}` } : {}
        },
      }),
    ],
  })
}
