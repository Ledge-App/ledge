import { useMemo, useState } from 'react'
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import { api } from '@/lib/api/client'
import { useAccounts } from '@/hooks/useAccounts'
import { formatAmount } from '@/lib/format/money'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { EmptyState } from '@/components/ui/EmptyState'
import type { Account } from '@/types/domain'

// One card per institution — guaranteed by clean-slate linking: relinking an institution
// replaces its previous connection, so duplicates can't accumulate here. The account rows
// are informational; to drop a single account, relink the institution without it.
export default function InstitutionsScreen() {
  const [error, setError] = useState<string | null>(null)
  const utils = api.useUtils()
  const { data: institutions, isLoading } = api.accounts.listInstitutions.useQuery()
  const accounts = useAccounts()

  const removeMutation = api.accounts.removeInstitution.useMutation({
    onSuccess: () => {
      utils.accounts.listInstitutions.invalidate()
      utils.accounts.list.invalidate()
    },
    onError: (err) => setError(err.message ?? 'Could not remove this institution. Try again.'),
  })

  const accountsByItem = useMemo(() => {
    const map = new Map<string, Account[]>()
    for (const account of accounts.data ?? []) {
      const group = map.get(account.itemId) ?? []
      group.push(account)
      map.set(account.itemId, group)
    }
    return map
  }, [accounts.data])

  function handleRemove(itemId: string, name: string) {
    Alert.alert(
      'Remove Institution',
      `Unlink ${name}? All accounts from this institution will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate({ itemId }) },
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

      {institutions.map((item) => {
        const itemAccounts = accountsByItem.get(item.itemId) ?? []
        const logo = itemAccounts[0]?.institutionLogo ?? null
        return (
          <View key={item.id} className="rounded-xl bg-surface px-4 py-2">
            <View className="flex-row items-center justify-between py-2">
              <View className="flex-1 flex-row items-center gap-3">
                {logo ? (
                  <Image source={{ uri: `data:image/png;base64,${logo}` }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                ) : (
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-surfaceRaised">
                    <Ionicons name="business" size={20} color={colors.textSecondary} />
                  </View>
                )}
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

            {itemAccounts.map((account) => (
              <View
                key={account.account_id}
                className="border-t py-3"
                style={{ borderColor: colors.border }}
              >
                <Text className="font-sans text-sm text-textPrimary" numberOfLines={1}>
                  {account.name}
                </Text>
                <Text className="font-sans text-xs text-textMuted">
                  {account.mask ? `··${account.mask} · ` : ''}
                  {formatAmount(account.balances?.current ?? 0)}
                </Text>
              </View>
            ))}
          </View>
        )
      })}
    </ScrollView>
  )
}
