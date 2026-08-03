import { useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import { api } from '@/lib/api/client'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { EmptyState } from '@/components/ui/EmptyState'

export default function InstitutionsScreen() {
  const [error, setError] = useState<string | null>(null)
  const utils = api.useUtils()
  const { data: institutions, isLoading } = api.accounts.listInstitutions.useQuery()
  const removeMutation = api.accounts.removeInstitution.useMutation({
    onSuccess: () => {
      utils.accounts.listInstitutions.invalidate()
      utils.accounts.list.invalidate()
    },
    onError: (err) => {
      setError(err.message ?? 'Could not remove this institution. Try again.')
    },
  })

  function handleRemove(itemId: string, name: string) {
    Alert.alert(
      'Remove Institution',
      `Unlink ${name}? All accounts from this institution will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeMutation.mutate({ itemId }),
        },
      ],
    )
  }

  if (isLoading) return <LoadingScreen />

  if (!institutions?.length) {
    return <EmptyState message="No linked institutions" />
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-3 px-5 py-4">
      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      {institutions.map((item) => (
        <View
          key={item.id}
          className="flex-row items-center justify-between rounded-xl bg-surface px-4 py-4"
        >
          <View className="flex-1 flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-surfaceRaised">
              <Ionicons name="business" size={20} color={colors.textSecondary} />
            </View>
            <Text className="font-sansMed text-base text-textPrimary">{item.institutionName}</Text>
          </View>
          <Pressable
            onPress={() => handleRemove(item.itemId, item.institutionName)}
            hitSlop={8}
            disabled={removeMutation.isLoading}
          >
            <Ionicons name="trash-outline" size={20} color={colors.expense} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  )
}
