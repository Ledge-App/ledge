import { router } from 'expo-router'
import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { signOut } from '@/lib/supabase/auth'
import { SettingsRow } from '@/components/ui/SettingsRow'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

export default function SettingsIndexScreen() {
  const [error, setError] = useState<string | null>(null)

  async function handleSignOut() {
    try {
      await signOut()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out. Try again.')
    }
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 px-5 py-6">
      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      <View className="gap-1">
        <Text className="px-4 font-sansMed text-sm text-textMuted">Accounts</Text>
        <View className="gap-1 rounded-md bg-surface">
          <SettingsRow icon="card" label="Accounts" onPress={() => router.push('/(tabs)/settings/accounts')} />
          <SettingsRow icon="link" label="Linked Institutions" onPress={() => router.push('/(tabs)/settings/institutions')} />
          <SettingsRow
            icon="key"
            label="Plaid Developer Account"
            onPress={() => router.push('/(tabs)/settings/plaid-account')}
          />
          <SettingsRow icon="pricetags" label="Categories" onPress={() => router.push('/(tabs)/settings/categories')} />
        </View>
      </View>

      <View className="gap-1">
        <Text className="px-4 font-sansMed text-sm text-textMuted">Session</Text>
        <View className="gap-1 rounded-md bg-surface">
          <SettingsRow icon="log-out" label="Sign Out" tone="danger" onPress={handleSignOut} />
        </View>
      </View>
    </ScrollView>
  )
}
