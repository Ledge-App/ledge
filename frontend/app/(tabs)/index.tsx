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
import { useReimbursements } from '@/hooks/useReimbursements'
import { CategoryCard } from '@/components/categories/CategoryCard'
import { MonthNavigator } from '@/components/transactions/MonthNavigator'
import { AccountsFilterDropdown } from '@/components/ui/AccountsFilterDropdown'
import { CategorySheet } from '@/components/transactions/CategorySheet'
import { ReimbursementSheet } from '@/components/reimbursements/ReimbursementSheet'
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

export default function DashboardScreen() {
  const [month, setMonth] = useState(currentMonth())
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [expensesOpen, setExpensesOpen] = useState(true)
  const [incomeOpen, setIncomeOpen] = useState(true)
  const [activeSheetItem, setActiveSheetItem] = useState<FeedItem | null>(null)
  const [reimbursementItem, setReimbursementItem] = useState<FeedItem | null>(null)
  const [pendingReimbursementMeta, setPendingReimbursementMeta] = useState<{ categoryId: string; subcategoryId: string | null } | null>(null)
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
  const reimbursements = useReimbursements()

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
      setActiveSheetItem(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this change. Try again.')
    }
  }

  async function handleOpenReimbursement(input: { categoryId: string; subcategoryId: string | null }) {
    if (!activeSheetItem) return
    const item = activeSheetItem
    try {
      await overrides.upsert({ plaidTransactionId: item.id, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
      setPendingReimbursementMeta(input)
      setReimbursementItem(item)
      setActiveSheetItem(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this change. Try again.')
    }
  }

  async function handleSaveReimbursement(linkedIncomeIds: string[]) {
    if (!reimbursementItem) return
    try {
      for (const incomeId of linkedIncomeIds) {
        const incomeItem = feed.find((i) => i.id === incomeId)
        if (!incomeItem) continue
        await reimbursements.create({
          expensePlaidTransactionId: reimbursementItem.source === 'plaid' ? reimbursementItem.id : null,
          expenseManualTransactionId: reimbursementItem.source === 'manual' ? reimbursementItem.id : null,
          incomePlaidTransactionId: incomeItem.source === 'plaid' ? incomeItem.id : null,
          incomeManualTransactionId: incomeItem.source === 'manual' ? incomeItem.id : null,
          amount: Math.abs(incomeItem.amount).toFixed(2),
          note: null,
        })
      }
      setReimbursementItem(null)
      setPendingReimbursementMeta(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this reimbursement. Try again.')
    }
  }

  const candidateIncomeItems = feed.filter(
    (item) => item.amount < 0 && item.id !== reimbursementItem?.id && !item.isReimbursementIncome,
  )

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
        onClose={() => setActiveSheetItem(null)}
        onSave={handleSaveCategory}
        onOpenReimbursement={handleOpenReimbursement}
      />
      <ReimbursementSheet
        visible={reimbursementItem != null}
        expenseItem={reimbursementItem}
        candidateIncomeItems={candidateIncomeItems}
        onClose={() => {
          setReimbursementItem(null)
          setPendingReimbursementMeta(null)
        }}
        onSave={handleSaveReimbursement}
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
