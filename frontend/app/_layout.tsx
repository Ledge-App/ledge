import '../global.css'
import {
  DMSans_700Bold,
  useFonts as useDMSansFonts,
} from '@expo-google-fonts/dm-sans'
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts as useInterFonts,
} from '@expo-google-fonts/inter'
import { JetBrainsMono_400Regular, useFonts as useMonoFonts } from '@expo-google-fonts/jetbrains-mono'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryPersister } from '@/lib/storage/queryPersister'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { usePurgeSessionOnFreshInstall } from '@/hooks/usePurgeSessionOnFreshInstall'
import { useResetCacheOnUserChange } from '@/hooks/useResetCacheOnUserChange'
import { api, createApiClient } from '@/lib/api/client'
import { colors } from '@/constants/theme'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [dmSansLoaded] = useDMSansFonts({ DMSans_700Bold })
  const [interLoaded] = useInterFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold })
  const [monoLoaded] = useMonoFonts({ JetBrainsMono_400Regular })
  const fontsLoaded = dmSansLoaded && interLoaded && monoLoaded

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale-while-revalidate: restored/persisted data renders immediately and anything
            // older than a minute refetches in the background. cacheTime must outlive maxAge
            // below, or restored queries would be garbage-collected on arrival.
            staleTime: 60 * 1000,
            cacheTime: 24 * 60 * 60 * 1000,
          },
        },
      }),
  )
  const [trpcClient] = useState(() => createApiClient())

  // The caches outlive any one session — drop them when the signed-in user changes so one
  // user's data can never render for the next.
  useResetCacheOnUserChange(queryClient)

  // The Keychain outlives an uninstall, so a reinstall would otherwise restore the previous
  // session. Nothing may render until this resolves, or the redirect in `app/index.tsx`
  // runs against the session being torn down.
  const isPurgingSession = usePurgeSessionOnFreshInstall()

  const isReady = fontsLoaded && !isPurgingSession

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync()
    }
  }, [isReady])

  if (!isReady) {
    return <View className="flex-1 bg-background" />
  }

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: queryPersister, maxAge: 24 * 60 * 60 * 1000 }}
      >
        <api.Provider client={trpcClient} queryClient={queryClient}>
          <View className="flex-1 bg-background">
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            />
          </View>
        </api.Provider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  )
}
