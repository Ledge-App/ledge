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
import { useAmountsMasked } from '@/hooks/useAmountsMasked'
import { usePlaidCredentials } from '@/hooks/usePlaidCredentials'
import { usePlaidLink } from '@/hooks/usePlaidLink'
import { HeroCard } from '@/components/dashboard/HeroCard'
import { AccountRow } from '@/components/accounts/AccountRow'
import { NetWorthTrendSheet } from '@/components/accounts/NetWorthTrendSheet'
import { computeNetWorthTotals, isInvestmentAccount, isLiabilityAccount } from '@/lib/accounts/netWorth'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { EmptyState } from '@/components/ui/EmptyState'

export default function AccountsScreen() {
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [trendOpen, setTrendOpen] = useState(false)
  const utils = api.useUtils()
  const accounts = useAccounts()
  const { feed, isLoading: feedIsLoading } = useTransactionFeed()
  const { isMasked, toggleMask } = useAmountsMasked()
  const credentials = usePlaidCredentials()
  const { createLinkToken, exchangeToken } = usePlaidLink()

  const cashAccounts = useMemo(() => (accounts.data ?? []).filter((a) => !isLiabilityAccount(a)), [accounts.data])
  const creditAccounts = useMemo(() => (accounts.data ?? []).filter(isLiabilityAccount), [accounts.data])

  const { totalAssets, totalLiabilities, cashOnHand, netWorth } = useMemo(
    () => computeNetWorthTotals(accounts.data ?? [], feed),
    [accounts.data, feed],
  )

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

  // design.md specifies a full-screen prompt for this screen when nothing is linked,
  // routing to the BYOK screen first if no Plaid credentials exist yet.
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
      <ScrollView contentContainerClassName="gap-6 px-5 py-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sansSemi text-lg text-textPrimary">All Accounts</Text>
          <Pressable onPress={handleAddAccount} accessibilityLabel="Add account" disabled={isConnecting || credentials.isLoading}>
            <Ionicons name="add-circle" size={26} color={colors.primary} />
          </Pressable>
        </View>

        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

        <HeroCard
          netWorth={netWorth}
          totalAssets={totalAssets}
          totalLiabilities={totalLiabilities}
          isLoading={accounts.isLoading}
          isMasked={isMasked}
          onToggleMask={toggleMask}
          onTrendPress={() => setTrendOpen(true)}
        />

        {/* Always rendered: the Cash row is a built-in account, present even with nothing linked. */}
        <View className="gap-1">
          <Text className="font-sansMed text-sm text-textMuted">CASH ACCOUNTS</Text>
          {cashAccounts.map((account) => (
            <AccountRow
              key={account.account_id}
              name={account.name}
              balance={account.balances?.current ?? 0}
              variant={isInvestmentAccount(account) ? 'investment' : 'cash'}
              isMasked={isMasked}
            />
          ))}
          <AccountRow name="Cash" balance={cashOnHand} variant="cashOnHand" isMasked={isMasked} />
        </View>

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
                isMasked={isMasked}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <NetWorthTrendSheet
        visible={trendOpen}
        onClose={() => setTrendOpen(false)}
        netWorth={netWorth}
        accounts={accounts.data ?? []}
        feed={feed}
        isLoading={accounts.isLoading || feedIsLoading}
      />
    </SafeAreaView>
  )
}
