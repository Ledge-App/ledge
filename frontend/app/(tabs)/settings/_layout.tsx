import { Stack } from 'expo-router'
import { colors } from '@/constants/theme'

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: 'Inter_600SemiBold' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="plaid-account" options={{ title: 'Plaid Developer Account' }} />
    </Stack>
  )
}
