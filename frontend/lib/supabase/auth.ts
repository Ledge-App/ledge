import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin'
import { createClient, type Session } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

// Auth only: sign in, session, refresh — no data queries (see architecture.md).
// Google is the only identity provider; the Email provider is disabled in the Supabase
// dashboard, so there is no password path to fall back to.

// expo-secure-store has no web implementation (iOS is the only shipped platform
// per architecture.md) — fall back to localStorage so the app doesn't crash when
// previewed via `expo start --web`, and no-op under SSR where window is undefined.
const SecureStoreAdapter = {
  getItem: (key: string) => {
    if (Platform.OS === 'web') return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null)
    return SecureStore.getItemAsync(key)
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS === 'web') return Promise.resolve(globalThis.localStorage?.setItem(key, value))
    return SecureStore.setItemAsync(key, value)
  },
  removeItem: (key: string) => {
    if (Platform.OS === 'web') return Promise.resolve(globalThis.localStorage?.removeItem(key))
    return SecureStore.deleteItemAsync(key)
  },
}

export const supabaseAuth = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
)

// `webClientId` is not about a web build: Supabase validates the ID token's `aud` against
// the Web OAuth client registered on its Google provider, so the token must be minted for
// that client even though sign-in happens through the iOS one.
GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
})

// Returns null when the user dismisses the Google sheet — a cancel is not a failure, and
// surfacing it as one would flash an error banner at someone who just tapped outside.
// The SDK reports a dismissal as a `cancelled` response rather than a rejection, but a
// stale cached credential still rejects with SIGN_IN_CANCELLED, so both are handled.
export async function signInWithGoogle() {
  let idToken: string
  try {
    const response = await GoogleSignin.signIn()
    if (response.type === 'cancelled') return null
    if (!response.data.idToken) throw new Error('Google did not return an ID token.')
    idToken = response.data.idToken
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) return null
    throw err
  }

  const { data, error } = await supabaseAuth.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  })
  if (error) throw error
  return data
}

// Google's own session is cleared too, not just Supabase's. Left signed in, the SDK would
// hand back the previous account without a picker on the next tap, so signing out and back
// in could never switch accounts.
export async function signOut() {
  await GoogleSignin.signOut()
  const { error } = await supabaseAuth.auth.signOut()
  if (error) throw error
}

/**
 * Ends the session on this device only, without asking the auth server to revoke it.
 *
 * For the one case where the account no longer exists: after deletion the server has already
 * invalidated everything, and a normal `signOut()` — which calls the server — can come back an
 * error for the missing user and throw. That would leave a local session pointing at a deleted
 * account, i.e. the user still "signed in" to nothing. `scope: 'local'` skips the server call,
 * which is all that is left to do anyway.
 *
 * Still emits SIGNED_OUT, so `useResetCacheOnUserChange` clears the query and MMKV caches.
 */
export async function clearLocalSession() {
  await GoogleSignin.signOut()
  await supabaseAuth.auth.signOut({ scope: 'local' })
}

interface SessionState {
  session: Session | null
  isLoading: boolean
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true })

  useEffect(() => {
    supabaseAuth.auth.getSession().then(({ data }) => {
      setState({ session: data.session, isLoading: false })
    })

    const { data: listener } = supabaseAuth.auth.onAuthStateChange((_event, session) => {
      setState({ session, isLoading: false })
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  return state
}
