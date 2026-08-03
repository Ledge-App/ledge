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
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
      <Stack.Screen name="plaid-account" options={{ title: 'Plaid Developer Account' }} />
      <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      <Stack.Screen name="category-form" options={{ title: 'Category' }} />
      <Stack.Screen name="institutions" options={{ title: 'Linked Institutions' }} />
    </Stack>
  )
}
