import { useMemo, useState } from 'react'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { createPlaidLinkSession } from 'react-native-plaid-link-sdk'
import { colors } from '@/constants/theme'
import { api } from '@/lib/api/client'
import { useAccounts } from '@/hooks/useAccounts'
import { useAmountsMasked } from '@/hooks/useAmountsMasked'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { usePlaidCredentials } from '@/hooks/usePlaidCredentials'
import { usePlaidLink } from '@/hooks/usePlaidLink'
import { HeroCard } from '@/components/dashboard/HeroCard'
import { AccountRow } from '@/components/accounts/AccountRow'
import { AccountDetailSheet } from '@/components/accounts/AccountDetailSheet'
import { NetWorthTrendSheet } from '@/components/accounts/NetWorthTrendSheet'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatMaskableAmount } from '@/lib/format/money'
import { computeNetWorthTotals, isInvestmentAccount, isLiabilityAccount } from '@/lib/accounts/netWorth'
import type { Account } from '@/types/domain'

export default function AccountsTab() {
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [cashOpen, setCashOpen] = useState(true)
  const [creditOpen, setCreditOpen] = useState(true)
  // 'cash' is the built-in cash row, which has no Plaid account behind it.
  const [detailTarget, setDetailTarget] = useState<Account | 'cash' | null>(null)
  const [trendOpen, setTrendOpen] = useState(false)
  const utils = api.useUtils()
  const accounts = useAccounts()
  const { isMasked, toggleMask } = useAmountsMasked()
  const { feed, categoryById, isLoading: feedIsLoading } = useTransactionFeed()
  const credentials = usePlaidCredentials()
  const { createLinkToken, exchangeToken } = usePlaidLink()

  const cashAccounts = useMemo(() => (accounts.data ?? []).filter((a) => !isLiabilityAccount(a)), [accounts.data])
  const creditAccounts = useMemo(() => (accounts.data ?? []).filter(isLiabilityAccount), [accounts.data])

  // totalAssets includes cash on hand, which is exactly what the Cash Accounts section totals
  // now that the Cash row lives inside it.
  const { totalAssets, totalLiabilities, cashOnHand, netWorth } = useMemo(
    () => computeNetWorthTotals(accounts.data ?? [], feed),
    [accounts.data, feed],
  )

  const detail = useMemo(() => {
    if (detailTarget == null) return null
    if (detailTarget === 'cash') {
      return {
        title: 'Cash',
        balance: cashOnHand,
        variant: 'cashOnHand' as const,
        items: feed.filter((item) => item.source === 'manual'),
        emptyLabel: 'No cash transactions yet',
      }
    }
    return {
      title: detailTarget.name,
      balance: detailTarget.balances?.current ?? 0,
      variant: isLiabilityAccount(detailTarget) ? ('credit' as const) : isInvestmentAccount(detailTarget) ? ('investment' as const) : ('cash' as const),
      items: feed.filter((item) => item.accountId === detailTarget.account_id),
      emptyLabel: 'No transactions for this account',
    }
  }, [detailTarget, feed, cashOnHand])

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
          netWorth={netWorth}
          totalAssets={totalAssets}
          totalLiabilities={totalLiabilities}
          isLoading={accounts.isLoading}
          isMasked={isMasked}
          onToggleMask={toggleMask}
          onTrendPress={() => setTrendOpen(true)}
        />

        {/* Always rendered: the Cash row is a built-in account, present even with nothing linked. */}
        <View className="rounded-xl bg-surface px-4">
            <Pressable onPress={() => setCashOpen((v) => !v)} className="flex-row items-center justify-between gap-3 py-4">
              <Text className="font-sansSemi text-sm text-primary">Cash Accounts</Text>
              <View className="flex-row items-center gap-1">
                <Text className="font-sansMed text-sm text-textSecondary" numberOfLines={1}>Balance {formatMaskableAmount(totalAssets, isMasked)}</Text>
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
                      isMasked={isMasked}
                      onPress={() => setDetailTarget(account)}
                    />
                  </View>
                ))}
                <View className="border-t" style={{ borderColor: colors.border }}>
                  <AccountRow
                    name="Cash"
                    balance={cashOnHand}
                    variant="cashOnHand"
                    isMasked={isMasked}
                    onPress={() => setDetailTarget('cash')}
                  />
                </View>
              </View>
            ) : null}
        </View>

        {creditAccounts.length > 0 ? (
          <View className="rounded-xl bg-surface px-4">
            <Pressable onPress={() => setCreditOpen((v) => !v)} className="flex-row items-center justify-between gap-3 py-4">
              <Text className="font-sansSemi text-sm text-expense">Credit Accounts</Text>
              <View className="flex-row items-center gap-1">
                <Text className="font-sansMed text-sm text-expense" numberOfLines={1}>Owed {formatMaskableAmount(totalLiabilities, isMasked)}</Text>
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
                      isMasked={isMasked}
                      onPress={() => setDetailTarget(account)}
                    />
                  </View>
                ))}
              </View>
            ) : null}
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

      <AccountDetailSheet
        visible={detail != null}
        title={detail?.title ?? ''}
        balance={detail?.balance ?? 0}
        variant={detail?.variant ?? 'cash'}
        items={detail?.items ?? []}
        emptyLabel={detail?.emptyLabel}
        isMasked={isMasked}
        categoryById={categoryById}
        onClose={() => setDetailTarget(null)}
      />
    </SafeAreaView>
  )
}
