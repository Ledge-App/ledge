import { api } from '@/lib/api/client'
import { clearLocalSession } from '@/lib/supabase/auth'

/**
 * Deletes the signed-in account, then tears the session down on this device.
 *
 * The local teardown is deliberately not a full `signOut()`: by the time the mutation resolves
 * the account is gone server-side, so revoking the session there can fail and strand the user
 * signed in to a deleted account. `clearLocalSession` drops it locally and still emits
 * SIGNED_OUT, which is what `useResetCacheOnUserChange` listens for to empty the query and
 * MMKV caches — so no deleted user's data survives on the device.
 *
 * Navigation is left to the auth gate in `app/index.tsx`, which already redirects on a null
 * session; pushing a route here would race it.
 */
export function useDeleteAccount() {
  const mutation = api.account.delete.useMutation()

  async function deleteAccount(): Promise<void> {
    await mutation.mutateAsync()
    await clearLocalSession()
  }

  return { deleteAccount, isDeleting: mutation.isLoading }
}
