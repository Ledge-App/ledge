import { Redirect, Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSession } from '@/lib/supabase/auth'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { colors } from '@/constants/theme'

export default function OnboardingLayout() {
  const { session, isLoading } = useSession()

  if (isLoading) return <LoadingScreen />
  if (!session) return <Redirect href="/(auth)/login" />

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
    </SafeAreaView>
  )
}
