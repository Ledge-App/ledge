import { useEffect, useState } from 'react'
import { hasInstallMarker, setInstallMarker } from '@/lib/storage/install'
import { supabaseAuth } from '@/lib/supabase/auth'

/**
 * Ends any session that outlived an uninstall, so deleting the app signs the user out.
 *
 * The Supabase session lives in the Keychain via expo-secure-store, and iOS keeps Keychain
 * items when an app is deleted — so a reinstall restored the previous user's session while
 * every cache around it had been wiped. Absence of the install marker (which does live in
 * the erased app container) is the only signal that this happened.
 *
 * Returns whether the purge is still running. The caller must hold rendering until it
 * finishes: `app/index.tsx` redirects on the restored session, so letting it mount first
 * would navigate the about-to-be-signed-out user into the app.
 */
export function usePurgeSessionOnFreshInstall(): boolean {
  // Read synchronously during the first render, before the marker is written — an effect
  // would run after the redirect in `app/index.tsx` had already been decided.
  const [isFreshInstall] = useState(() => !hasInstallMarker())
  const [isPurging, setIsPurging] = useState(isFreshInstall)

  useEffect(() => {
    if (!isFreshInstall) return

    let cancelled = false
    void (async () => {
      try {
        await supabaseAuth.auth.signOut()
      } catch {
        // A genuine first install has no session to end, and supabase-js reports that as an
        // error. Either way the goal — no session — is met, so fall through to the marker.
      }
      // Written after the sign-out attempt so a crash mid-purge simply retries next launch.
      setInstallMarker()
      if (!cancelled) setIsPurging(false)
    })()

    return () => {
      cancelled = true
    }
  }, [isFreshInstall])

  return isPurging
}
