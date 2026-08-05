import { useMemo, useState } from 'react'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { createPlaidLinkSession } from 'react-native-plaid-link-sdk'
import { colors } from '@/constants/theme'
import { api } from '@/lib/api/client'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { usePlaidCredentials } from '@/hooks/usePlaidCredentials'
import { usePlaidLink } from '@/hooks/usePlaidLink'
import { HeroCard } from '@/components/dashboard/HeroCard'
import { AccountRow } from '@/components/accounts/AccountRow'
import { AccountDetailSheet } from '@/components/accounts/AccountDetailSheet'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatAmount } from '@/lib/format/money'
import type { Account } from '@/types/domain'

function isLiabilityAccount(account: { type: string }): boolean {
  return account.type === 'credit' || account.type === 'loan'
}

function isInvestmentAccount(account: { type: string }): boolean {
  return account.type === 'investment' || account.type === 'brokerage'
}

export default function AccountsTab() {
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [cashOpen, setCashOpen] = useState(true)
  const [creditOpen, setCreditOpen] = useState(true)
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
  const utils = api.useUtils()
  const accounts = useAccounts()
  const { feed, categoryById } = useTransactionFeed()
  const credentials = usePlaidCredentials()
  const { createLinkToken, exchangeToken } = usePlaidLink()

  const cashAccounts = useMemo(() => (accounts.data ?? []).filter((a) => !isLiabilityAccount(a)), [accounts.data])
  const creditAccounts = useMemo(() => (accounts.data ?? []).filter(isLiabilityAccount), [accounts.data])

  const totalAssets = cashAccounts.reduce((sum, a) => sum + (a.balances?.current ?? 0), 0)
  const totalLiabilities = creditAccounts.reduce((sum, a) => sum + (a.balances?.current ?? 0), 0)

  async function handleAddAccount() {
    setError(null)
    if (credentials.isLoading) return
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
            await utils.accounts.list.invalidate()
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

  if (!accounts.isLoading && (accounts.data?.length ?? 0) === 0 && !credentials.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <View className="px-5 pt-4">{error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}</View>
        {!credentials.data ? (
          <EmptyState
            message="Connect your Plaid developer account to get started"
            actionLabel="Connect Plaid"
            onAction={() => router.push('/(tabs)/settings/plaid-account')}
          />
        ) : (
          <EmptyState
            message="Link your first account to get started"
            actionLabel="Link Account"
            onAction={handleAddAccount}
          />
        )}
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerClassName="gap-5 px-5 py-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sansSemi text-lg text-primary">All</Text>
          <Pressable onPress={handleAddAccount} accessibilityLabel="Add account" disabled={isConnecting || credentials.isLoading}>
            <Ionicons name="add-circle-outline" size={26} color={colors.textPrimary} />
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
          <View className="rounded-xl bg-surface px-4">
            <Pressable onPress={() => setCashOpen((v) => !v)} className="flex-row items-center justify-between gap-3 py-4">
              <Text className="font-sansSemi text-sm text-primary">Cash Accounts</Text>
              <View className="flex-row items-center gap-1">
                <Text className="font-sansMed text-sm text-textSecondary" numberOfLines={1}>Balance {formatAmount(totalAssets)}</Text>
                <Ionicons name={cashOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
              </View>
            </Pressable>
            {cashOpen ? (
              <View>
                {cashAccounts.map((account) => (
                  <View key={account.account_id} className="border-t" style={{ borderColor: colors.border }}>
                    <AccountRow
                      name={account.name}
                      balance={account.balances?.current ?? 0}
                      variant={isInvestmentAccount(account) ? 'investment' : 'cash'}
                      onPress={() => setSelectedAccount(account)}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {creditAccounts.length > 0 ? (
          <View className="rounded-xl bg-surface px-4">
            <Pressable onPress={() => setCreditOpen((v) => !v)} className="flex-row items-center justify-between gap-3 py-4">
              <Text className="font-sansSemi text-sm text-expense">Credit Accounts</Text>
              <View className="flex-row items-center gap-1">
                <Text className="font-sansMed text-sm text-expense" numberOfLines={1}>Owed {formatAmount(totalLiabilities)}</Text>
                <Ionicons name={creditOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
              </View>
            </Pressable>
            {creditOpen ? (
              <View>
                {creditAccounts.map((account) => (
                  <View key={account.account_id} className="border-t" style={{ borderColor: colors.border }}>
                    <AccountRow
                      name={account.name}
                      balance={account.balances?.current ?? 0}
                      variant="credit"
                      limit={account.balances?.limit ?? null}
                      onPress={() => setSelectedAccount(account)}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <AccountDetailSheet
        visible={selectedAccount != null}
        account={selectedAccount}
        feed={feed}
        categoryById={categoryById}
        onClose={() => setSelectedAccount(null)}
      />
    </SafeAreaView>
  )
}
