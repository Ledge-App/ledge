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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { Stack } from 'expo-router'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useResetCacheOnUserChange } from '@/hooks/useResetCacheOnUserChange'
import { api, createApiClient } from '@/lib/api/client'
import { colors } from '@/constants/theme'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const [dmSansLoaded] = useDMSansFonts({ DMSans_700Bold })
  const [interLoaded] = useInterFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold })
  const [monoLoaded] = useMonoFonts({ JetBrainsMono_400Regular })
  const fontsLoaded = dmSansLoaded && interLoaded && monoLoaded

  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() => createApiClient())

  // The cache outlives any one session — drop it when the signed-in user changes so one
  // user's data can never render for the next.
  useResetCacheOnUserChange(queryClient)

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded])

  if (!fontsLoaded) {
    return <View className="flex-1 bg-background" />
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
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
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
