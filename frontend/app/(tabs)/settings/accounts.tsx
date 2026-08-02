import { useMemo, useState } from 'react'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { createPlaidLinkSession } from 'react-native-plaid-link-sdk'
import { colors } from '@/constants/theme'
import { useAccounts } from '@/hooks/useAccounts'
import { usePlaidCredentials } from '@/hooks/usePlaidCredentials'
import { usePlaidLink } from '@/hooks/usePlaidLink'
import { HeroCard } from '@/components/dashboard/HeroCard'
import { AccountRow } from '@/components/accounts/AccountRow'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

// Plaid's AccountType enum: 'investment' | 'credit' | 'depository' | 'loan' | 'brokerage' | 'other'.
function isCreditAccount(account: { type: string }): boolean {
  return account.type === 'credit'
}

function isInvestmentAccount(account: { type: string }): boolean {
  return account.type === 'investment' || account.type === 'brokerage'
}

export default function AccountsScreen() {
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const accounts = useAccounts()
  const credentials = usePlaidCredentials()
  const { createLinkToken, exchangeToken } = usePlaidLink()

  const cashAccounts = useMemo(() => (accounts.data ?? []).filter((a) => !isCreditAccount(a)), [accounts.data])
  const creditAccounts = useMemo(() => (accounts.data ?? []).filter(isCreditAccount), [accounts.data])

  const totalAssets = cashAccounts.reduce((sum, a) => sum + (a.balances?.current ?? 0), 0)
  const totalLiabilities = creditAccounts.reduce((sum, a) => sum + (a.balances?.current ?? 0), 0)

  async function handleAddAccount() {
    setError(null)
    if (!credentials.data) {
      router.push('/(tabs)/settings/plaid-account')
      return
    }

    setIsConnecting(true)
    try {
      const { linkToken } = await createLinkToken()
      const session = await createPlaidLinkSession({
        token: linkToken,
        onEvent: () => {},
        onExit: (exit) => {
          setIsConnecting(false)
          if (exit.error) setError(exit.error.errorMessage ?? 'Bank connection was cancelled.')
        },
        onSuccess: async (success) => {
          try {
            await exchangeToken({ publicToken: success.publicToken })
            accounts.data && (await Promise.resolve())
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not finish linking this account.')
          } finally {
            setIsConnecting(false)
          }
        },
      })
      await session.open()
    } catch (err) {
      setIsConnecting(false)
      setError(err instanceof Error ? err.message : 'Could not open Plaid Link. Try again.')
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerClassName="gap-6 px-5 py-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sansSemi text-lg text-textPrimary">All Accounts</Text>
          <Pressable onPress={handleAddAccount} accessibilityLabel="Add account" disabled={isConnecting}>
            <Ionicons name="add-circle" size={26} color={colors.primary} />
          </Pressable>
        </View>

        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

        <HeroCard
          netWorth={totalAssets - totalLiabilities}
          totalAssets={totalAssets}
          totalLiabilities={totalLiabilities}
          isLoading={accounts.isLoading}
        />

        {cashAccounts.length > 0 ? (
          <View className="gap-1">
            <Text className="font-sansMed text-sm text-textMuted">CASH ACCOUNTS</Text>
            {cashAccounts.map((account) => (
              <AccountRow
                key={account.account_id}
                name={account.name}
                balance={account.balances?.current ?? 0}
                variant={isInvestmentAccount(account) ? 'investment' : 'cash'}
              />
            ))}
          </View>
        ) : null}

        {creditAccounts.length > 0 ? (
          <View className="gap-1">
            <Text className="font-sansMed text-sm text-textMuted">CREDIT ACCOUNTS</Text>
            {creditAccounts.map((account) => (
              <AccountRow
                key={account.account_id}
                name={account.name}
                balance={account.balances?.current ?? 0}
                variant="credit"
                limit={account.balances?.limit ?? null}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
