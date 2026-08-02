import { createClient, type Session } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

// Auth only: sign in/up, session, refresh — no data queries (see architecture.md).

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

export async function signUp(email: string, password: string) {
  const { data, error } = await supabaseAuth.auth.signUp({ email, password })
  if (error) throw error
  return data
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabaseAuth.auth.signOut()
  if (error) throw error
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
