import { MMKV } from 'react-native-mmkv'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

/**
 * Persists the React Query cache across launches, so a relaunch paints every tab from the
 * last session's data immediately and refetches underneath (stale-while-revalidate) instead
 * of blocking first paint on the network. Its own MMKV instance, separate from the
 * transaction cache: the two are cleared on different triggers and must not share keys.
 */
const storage = new MMKV({ id: 'ledge-query-cache' })

export const queryPersister = createSyncStoragePersister({
  storage: {
    getItem: (key: string) => storage.getString(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
  // Snapshots run to a few hundred KB; throttling keeps MMKV writes out of query-update
  // bursts (a sync landing invalidates several queries at once).
  throttleTime: 2000,
})

/**
 * Drops the persisted snapshot immediately. queryClient.clear() alone is not enough on a
 * user change: the persister writes on a throttle, so an app killed inside that window
 * would hand the previous user's persisted queries to the next launch.
 */
export function clearPersistedQueryCache(): void {
  storage.clearAll()
}
