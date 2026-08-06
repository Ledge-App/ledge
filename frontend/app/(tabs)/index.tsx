import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { useAccounts } from '@/hooks/useAccounts'
import { useBudgets } from '@/hooks/useBudgets'
import { useCategories } from '@/hooks/useCategories'
import { useSubcategories } from '@/hooks/useSubcategories'
import { useTransactionOverrides } from '@/hooks/useTransactionOverrides'
import { useVendorMappings } from '@/hooks/useVendorMappings'
import { useTransfers } from '@/hooks/useTransfers'
import { CategoryCard } from '@/components/categories/CategoryCard'
import { MonthNavigator } from '@/components/transactions/MonthNavigator'
import { AccountsFilterDropdown } from '@/components/ui/AccountsFilterDropdown'
import { CategorySheet } from '@/components/transactions/CategorySheet'
import { TransferSheet } from '@/components/transfers/TransferSheet'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { ViewTogglePill } from '@/components/visualizations/ViewTogglePill'
import { VisualizationPager } from '@/components/visualizations/VisualizationPager'
import { CategoryDetailSheet } from '@/components/visualizations/CategoryDetailSheet'
import { formatAmount } from '@/lib/format/money'
import { currentMonth, filterByMonth, shiftMonth } from '@/lib/transactions/filterByMonth'
import { aggregateMonth } from '@/lib/transactions/aggregateMonth'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { DonutSegment } from '@/lib/transactions/visualizationData'
import type { TransferKind } from '@/types/domain'

export default function DashboardScreen() {
  const [month, setMonth] = useState(currentMonth())
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [expensesOpen, setExpensesOpen] = useState(true)
  const [incomeOpen, setIncomeOpen] = useState(true)
  const [activeSheetItem, setActiveSheetItem] = useState<FeedItem | null>(null)
  const [transferItem, setTransferItem] = useState<FeedItem | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<{ kind: TransferKind; counterpartIds: string[] } | null>(null)
  const [transferForcedKind, setTransferForcedKind] = useState<TransferKind | undefined>(undefined)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [vizMode, setVizMode] = useState(false)
  const [detailState, setDetailState] = useState<{ segment: DonutSegment; mode: 'expense' | 'income' } | null>(null)

  const { feed, categoryById, isLoading, error } = useTransactionFeed()
  const accounts = useAccounts()
  const budgets = useBudgets()
  const categories = useCategories()
  const subcategories = useSubcategories()
  const overrides = useTransactionOverrides()
  const vendorMappings = useVendorMappings()
  const transfers = useTransfers()

  const accountFilteredFeed = useMemo(
    () => (selectedAccountId ? feed.filter((item) => item.accountId === selectedAccountId) : feed),
    [feed, selectedAccountId],
  )
  const monthFeed = useMemo(() => filterByMonth(accountFilteredFeed, month), [accountFilteredFeed, month])

  const { spendByCategory, incomeByCategory, totalExpense, totalIncome } = useMemo(
    () => aggregateMonth(monthFeed),
    [monthFeed],
  )

  const detailTransactions = useMemo(() => {
    if (!detailState) return []
    return monthFeed
      .filter((item) => {
        if (item.isReimbursementIncome) return false
        const isUncategorized = detailState.segment.categoryId === '__uncategorized__'
        if (isUncategorized ? item.categoryId !== null : item.categoryId !== detailState.segment.categoryId)
          return false
        const net = item.netAmount ?? item.amount
        return detailState.mode === 'expense' ? net > 0 : net < 0
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [monthFeed, detailState])

  const detailSegments = useMemo(() => {
    if (!detailState) return []
    const map = detailState.mode === 'expense' ? spendByCategory : incomeByCategory
    const total = detailState.mode === 'expense' ? totalExpense : totalIncome
    if (total === 0) return []
    return (categories.data ?? [])
      .filter((c) => map.has(c.id))
      .map((c) => ({
        categoryId: c.id,
        name: c.name,
        icon: c.icon,
        color: c.color,
        amount: map.get(c.id)!,
        percentage: (map.get(c.id)! / total) * 100,
        transactionCount: 0,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [detailState, spendByCategory, incomeByCategory, totalExpense, totalIncome, categories.data])

  async function handleSaveCategory(input: { categoryId: string; subcategoryId: string | null; applyToVendor: boolean }) {
    if (!activeSheetItem) return
    try {
      await overrides.upsert({ plaidTransactionId: activeSheetItem.id, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
      if (input.applyToVendor) {
        await vendorMappings.upsert({ vendorName: activeSheetItem.merchantName, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
      }
      if (pendingTransfer) {
        const isReimbursement = pendingTransfer.kind === 'reimbursement'
        for (const counterpartId of pendingTransfer.counterpartIds.length > 0 ? pendingTransfer.counterpartIds : [null]) {
          const counterpart = counterpartId ? feed.find((i) => i.id === counterpartId) ?? null : null
          const isExp = activeSheetItem.amount > 0
          const expenseItem = isExp ? activeSheetItem : counterpart
          const incomeItem = isExp ? counterpart : activeSheetItem
          await transfers.create({
            kind: pendingTransfer.kind,
            expensePlaidTransactionId: expenseItem?.source === 'plaid' ? expenseItem.id : null,
            expenseManualTransactionId: expenseItem?.source === 'manual' ? expenseItem.id : null,
            incomePlaidTransactionId: incomeItem?.source === 'plaid' ? incomeItem.id : null,
            incomeManualTransactionId: incomeItem?.source === 'manual' ? incomeItem.id : null,
            amount: isReimbursement && counterpart ? Math.abs(counterpart.amount).toFixed(2) : Math.abs(activeSheetItem.amount).toFixed(2),
            note: null,
          })
        }
        setPendingTransfer(null)
      }
      setActiveSheetItem(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this change. Try again.')
    }
  }

  function handleOpenTransfer(forcedKind?: TransferKind) {
    if (!activeSheetItem) return
    const item = activeSheetItem
    setTransferForcedKind(forcedKind)
    setActiveSheetItem(null)
    setTimeout(() => setTransferItem(item), 350)
  }

  function handleConfirmTransfer({ kind, counterpartIds }: { kind: TransferKind; counterpartIds: string[] }) {
    const item = transferItem
    setPendingTransfer({ kind, counterpartIds })
    setTransferItem(null)
    if (item) setTimeout(() => setActiveSheetItem(item), 350)
  }

  function handleDeclineTransfer() {
    const item = transferItem
    setTransferItem(null)
    if (item) setTimeout(() => setActiveSheetItem(item), 350)
  }

  async function handleUnmarkTransfer() {
    if (!activeSheetItem?.transferId) return
    try {
      await transfers.delete({ id: activeSheetItem.transferId })
      setActiveSheetItem(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not remove this transfer. Try again.')
    }
  }

  const transferCandidateItems = useMemo(() => {
    if (!transferItem) return []
    const wantExpense = transferItem.amount < 0
    return feed.filter((item) =>
      (wantExpense ? item.amount > 0 : item.amount < 0) && item.transferKind === null,
    )
  }, [feed, transferItem])

  const resolvedPendingTransfer = useMemo(() => {
    if (!pendingTransfer) return null
    const counterpartItems = pendingTransfer.counterpartIds
      .map((id) => feed.find((i) => i.id === id))
      .filter((i): i is FeedItem => i != null)
    return { kind: pendingTransfer.kind, counterpartItems }
  }, [pendingTransfer, feed])

  const hasNoAccounts = !accounts.isLoading && (accounts.data?.length ?? 0) === 0

  if (isLoading) return <LoadingScreen />

  if (hasNoAccounts) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <EmptyState message="Link an account in Settings to see your spending here." />
      </SafeAreaView>
    )
  }

  const expenseCategories = categories.data?.filter((c) => spendByCategory.has(c.id)) ?? []
  const incomeCategories = categories.data?.filter((c) => incomeByCategory.has(c.id)) ?? []

  const topBar = (
    <View className="flex-row items-center">
      <View className="flex-1 flex-row">
        <AccountsFilterDropdown accounts={accounts.data ?? []} selectedAccountId={selectedAccountId} onSelect={setSelectedAccountId} />
      </View>
      <MonthNavigator month={month} onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
      <View className="flex-1 items-end">
        <Ionicons name="paw" size={22} color={colors.textMuted} style={{ opacity: 0.4 }} />
      </View>
    </View>
  )

  const errorBanners = (
    <>
      {error ? <ErrorBanner message="Something went wrong loading your data." /> : null}
      {saveError ? <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} /> : null}
    </>
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      {vizMode ? (
        <>
          <View className="px-5 pt-4 pb-2" style={{ gap: 12 }}>
            {topBar}
            {errorBanners}
          </View>
          <VisualizationPager
            monthFeed={monthFeed}
            categories={categories.data ?? []}
            spendByCategory={spendByCategory}
            incomeByCategory={incomeByCategory}
            totalExpense={totalExpense}
            totalIncome={totalIncome}
            month={month}
            onSegmentPress={(segment, mode) => setDetailState({ segment, mode })}
          />
        </>
      ) : (
        <ScrollView contentContainerClassName="gap-5 px-5 py-4">
          {topBar}
          {errorBanners}

          <Pressable onPress={() => setExpensesOpen((v) => !v)} className="flex-row items-center justify-center gap-2">
            <Text className="font-sansSemi text-base text-textPrimary">Expenses {formatAmount(totalExpense)}</Text>
            <Ionicons name={expensesOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
          </Pressable>
          {expensesOpen ? (
            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              {expenseCategories.map((category) => (
                <View key={category.id} style={{ width: '31%' }}>
                  <CategoryCard
                    name={category.name}
                    icon={category.icon}
                    color={category.color}
                    spent={spendByCategory.get(category.id) ?? 0}
                    budget={budgets.data?.find((b) => b.categoryId === category.id) ? Number(budgets.data.find((b) => b.categoryId === category.id)!.amount) : null}
                  />
                </View>
              ))}
            </View>
          ) : null}

          <Pressable onPress={() => setIncomeOpen((v) => !v)} className="flex-row items-center justify-center gap-2">
            <Text className="font-sansSemi text-base text-textPrimary">Income {formatAmount(totalIncome)}</Text>
            <Ionicons name={incomeOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
          </Pressable>
          {incomeOpen ? (
            <View className="flex-row flex-wrap" style={{ gap: 10 }}>
              {incomeCategories.map((category) => (
                <View key={category.id} style={{ width: '31%' }}>
                  <CategoryCard name={category.name} icon={category.icon} color={category.color} spent={incomeByCategory.get(category.id) ?? 0} budget={null} />
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}

      <ViewTogglePill vizMode={vizMode} onToggle={() => setVizMode((v) => !v)} />

      <CategorySheet
        visible={activeSheetItem != null}
        item={activeSheetItem}
        categories={categories.data ?? []}
        subcategories={subcategories.data ?? []}
        pendingTransfer={resolvedPendingTransfer}
        onClose={() => { setActiveSheetItem(null); setPendingTransfer(null) }}
        onSave={handleSaveCategory}
        onOpenTransfer={handleOpenTransfer}
        onClearPendingTransfer={() => setPendingTransfer(null)}
        onUnmarkTransfer={handleUnmarkTransfer}
      />
      <TransferSheet
        visible={transferItem != null}
        item={transferItem}
        candidateItems={transferCandidateItems}
        accounts={accounts.data ?? []}
        isSaving={false}
        forcedKind={transferForcedKind}
        onClose={handleDeclineTransfer}
        onSave={handleConfirmTransfer}
      />
      <CategoryDetailSheet
        visible={detailState != null}
        segment={detailState?.segment ?? null}
        allSegments={detailSegments}
        transactions={detailTransactions}
        onClose={() => setDetailState(null)}
      />
    </SafeAreaView>
  )
}
