import type { QueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { shouldResetCache } from '@/lib/auth/shouldResetCache'
import { clearTransactionCache } from '@/lib/storage/mmkv'
import { clearPersistedQueryCache } from '@/lib/storage/queryPersister'
import { syncDriver } from '@/lib/transactions/syncDriver'
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
        // The persisted snapshot too, not just the live cache: the persister writes on a
        // throttle, so an app killed right after this clear could otherwise hand the previous
        // user's queries to the next launch.
        clearPersistedQueryCache()
        // The driver keeps its cooldown and in-flight state in module scope, which outlives
        // any session. Left alone, the returning user's first sync would be suppressed as a
        // duplicate of one run for the user who just signed out.
        syncDriver.reset()
      }
      cachedUserId.current = nextUserId
    })

    return () => listener.subscription.unsubscribe()
  }, [queryClient])
}
