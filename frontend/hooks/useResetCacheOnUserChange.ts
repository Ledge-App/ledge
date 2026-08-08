import type { QueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { shouldResetCache } from '@/lib/auth/shouldResetCache'
import { clearTransactionCache } from '@/lib/storage/mmkv'
import { supabaseAuth } from '@/lib/supabase/auth'

/**
 * Empties both on-device caches whenever the signed-in user changes.
 *
 * Listens at the auth layer rather than in the sign-out handler so it covers every way a
 * session can end — the Sign Out row, a refresh-token failure, an expired session — not
 * just the one the user taps.
 *
 * Clearing the query cache alone was not enough: the transaction feed reads its rows from
 * MMKV, not from React Query, so signing out and back in kept serving the old cache.
 *
 * Takes the client as an argument instead of calling `useQueryClient`, because it runs in
 * the same component that creates the `QueryClientProvider` and so sits above the context.
 */
export function useResetCacheOnUserChange(queryClient: QueryClient): void {
  // The user whose data the cache currently holds. A ref, not state: this drives an
  // imperative cache reset and must never itself trigger a re-render.
  const cachedUserId = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    const { data: listener } = supabaseAuth.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user.id ?? null
      if (shouldResetCache(cachedUserId.current, nextUserId)) {
        queryClient.clear()
        clearTransactionCache()
      }
      cachedUserId.current = nextUserId
    })

    return () => listener.subscription.unsubscribe()
  }, [queryClient])
}
