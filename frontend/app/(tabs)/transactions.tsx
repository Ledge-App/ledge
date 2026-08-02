import { useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, Pressable, SectionList, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useSubcategories } from '@/hooks/useSubcategories'
import { useTransactionOverrides } from '@/hooks/useTransactionOverrides'
import { useVendorMappings } from '@/hooks/useVendorMappings'
import { useReimbursements } from '@/hooks/useReimbursements'
import { useManualTransactions } from '@/hooks/useManualTransactions'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { MonthNavigator } from '@/components/transactions/MonthNavigator'
import { CalendarCell } from '@/components/transactions/CalendarCell'
import { AccountsFilterDropdown } from '@/components/ui/AccountsFilterDropdown'
import { CategorySheet } from '@/components/transactions/CategorySheet'
import { ReimbursementSheet } from '@/components/reimbursements/ReimbursementSheet'
import { ManualTransactionSheet } from '@/components/transactions/ManualTransactionSheet'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { formatAmount } from '@/lib/format/money'
import { currentMonth, filterByMonth, shiftMonth } from '@/lib/transactions/filterByMonth'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { ManualTransaction } from '@/types/domain'

export default function TransactionsScreen() {
  // Budgets navigates here with a categoryId param when a budget card is tapped.
  const { categoryId: categoryIdParam } = useLocalSearchParams<{ categoryId?: string }>()
  const [month, setMonth] = useState(currentMonth())
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(categoryIdParam ?? null)
  const [activeSheetItem, setActiveSheetItem] = useState<FeedItem | null>(null)
  const [reimbursementItem, setReimbursementItem] = useState<FeedItem | null>(null)
  const [manualSheetOpen, setManualSheetOpen] = useState(false)
  const [editingManualId, setEditingManualId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const { feed, categoryById, isLoading, error } = useTransactionFeed()
  const accounts = useAccounts()
  const categories = useCategories()
  const subcategories = useSubcategories()
  const overrides = useTransactionOverrides()
  const vendorMappings = useVendorMappings()
  const reimbursements = useReimbursements()
  const manualTransactions = useManualTransactions()

  const accountFilteredFeed = useMemo(
    () => (selectedAccountId ? feed.filter((item) => item.accountId === selectedAccountId) : feed),
    [feed, selectedAccountId],
  )
  const monthFeed = useMemo(() => filterByMonth(accountFilteredFeed, month), [accountFilteredFeed, month])

  // Category filtering is an additional narrowing on top of the account+month filter.
  const filteredFeed = useMemo(
    () => (categoryFilter ? monthFeed.filter((item) => item.categoryId === categoryFilter) : monthFeed),
    [monthFeed, categoryFilter],
  )

  useEffect(() => {
    setSelectedDay(null)
  }, [month])

  const sections = useMemo(() => {
    const byDate = new Map<string, FeedItem[]>()
    for (const item of filteredFeed) {
      const bucket = byDate.get(item.date) ?? []
      bucket.push(item)
      byDate.set(item.date, bucket)
    }
    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({
        title: date,
        total: items.reduce((sum, i) => (i.isReimbursementIncome ? sum : sum + (i.netAmount ?? i.amount)), 0),
        data: items,
      }))
  }, [filteredFeed])

  const daysInMonth = new Date(month.year, month.month, 0).getDate()
  const firstWeekday = new Date(month.year, month.month - 1, 1).getDay()
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const calendarDays = useMemo(() => {
    const days: Array<{ day: number; dateKey: string } | null> = []
    for (let i = 0; i < firstWeekday; i++) days.push(null)
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      days.push({ day, dateKey })
    }
    return days
  }, [month, daysInMonth, firstWeekday])

  const monthSummary = useMemo(() => {
    let income = 0
    let expense = 0
    for (const item of filteredFeed) {
      if (item.isReimbursementIncome) continue
      const net = item.netAmount ?? item.amount
      if (net > 0) expense += net
      else income += Math.abs(net)
    }
    return { income, expense, net: income - expense }
  }, [filteredFeed])

  const selectedDayItems = selectedDay ? filteredFeed.filter((item) => item.date === selectedDay) : []

  const spendByDayFiltered = useMemo(() => {
    const totals = new Map<string, { net: number; hasReimbursement: boolean }>()
    for (const item of filteredFeed) {
      const existing = totals.get(item.date) ?? { net: 0, hasReimbursement: false }
      const hasReimbursement = existing.hasReimbursement || item.reimbursedAmount != null || item.isReimbursementIncome
      if (item.isReimbursementIncome) {
        totals.set(item.date, { net: existing.net, hasReimbursement })
        continue
      }
      const net = item.netAmount ?? item.amount
      totals.set(item.date, { net: existing.net + net, hasReimbursement })
    }
    return totals
  }, [filteredFeed])

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
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this reimbursement. Try again.')
    }
  }

  async function handleSaveManual(input: { amount: string; type: 'expense' | 'income'; categoryId: string | null; subcategoryId: string | null; date: string; note: string | null }) {
    try {
      if (editingManualId) {
        await manualTransactions.update({ id: editingManualId, ...input })
      } else {
        await manualTransactions.create(input)
      }
      setManualSheetOpen(false)
      setEditingManualId(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this transaction. Try again.')
    }
  }

  function handleDeleteManual() {
    if (!editingManualId) return
    const id = editingManualId
    const feedItem = feed.find((item) => item.id === id)
    const isReimbursed = feedItem?.reimbursedAmount != null || feedItem?.isReimbursementIncome === true

    Alert.alert(
      isReimbursed ? 'This transaction is part of a reimbursement. Delete anyway?' : 'Delete this transaction?',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await manualTransactions.delete({ id })
              setManualSheetOpen(false)
              setEditingManualId(null)
            } catch (err) {
              setSaveError(err instanceof Error ? err.message : 'Could not delete this transaction. Try again.')
            }
          },
        },
      ],
    )
  }

  function handleRowPress(item: FeedItem) {
    if (item.source === 'manual') {
      setEditingManualId(item.id)
      setManualSheetOpen(true)
    } else {
      setActiveSheetItem(item)
    }
  }

  const editingManual: ManualTransaction | undefined = editingManualId
    ? manualTransactions.data?.find((m) => m.id === editingManualId)
    : undefined

  const candidateIncomeItems = feed.filter((item) => item.amount < 0 && item.id !== reimbursementItem?.id)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <AccountsFilterDropdown accounts={accounts.data ?? []} selectedAccountId={selectedAccountId} onSelect={setSelectedAccountId} />
        <MonthNavigator month={month} onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
        <View className="flex-row gap-3">
          <Pressable onPress={() => setViewMode('list')} accessibilityLabel="List view">
            <Ionicons name="list" size={20} color={viewMode === 'list' ? colors.primary : colors.textMuted} />
          </Pressable>
          <Pressable onPress={() => setViewMode('calendar')} accessibilityLabel="Calendar view">
            <Ionicons name="calendar" size={20} color={viewMode === 'calendar' ? colors.primary : colors.textMuted} />
          </Pressable>
        </View>
      </View>

      {categoryFilter ? (
        <View className="flex-row px-5 pb-2">
          <Pressable
            onPress={() => setCategoryFilter(null)}
            accessibilityLabel="Clear category filter"
            className="flex-row items-center gap-2 self-start rounded-full bg-surface px-3 py-1.5"
          >
            <Text className="font-sansMed text-sm text-textPrimary">
              {categoryById.get(categoryFilter)?.name ?? 'Category'}
            </Text>
            <Text className="font-sansMed text-sm text-textMuted">×</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <ErrorBanner message="Something went wrong loading your transactions." /> : null}
      {saveError ? <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} /> : null}

      {viewMode === 'list' ? (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 96 }}
          renderSectionHeader={({ section }) => (
            <View className="flex-row items-center justify-between bg-background py-2">
              <Text className="font-sansSemi text-sm text-textSecondary">{section.title}</Text>
              <Text className="font-mono text-sm text-textSecondary">{formatAmount(section.total)}</Text>
            </View>
          )}
          renderItem={({ item }) => {
            const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
            return (
              <TransactionRow
                item={item}
                categoryName={category?.name ?? 'Uncategorized'}
                categoryColor={category?.color ?? colors.textMuted}
                categoryIcon={category?.icon ?? '❓'}
                reimbursementCategoryName={item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null}
                onPress={() => handleRowPress(item)}
              />
            )
          }}
        />
      ) : (
        <View className="flex-1 px-5">
          <View className="mb-2 flex-row">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Text key={day} className="text-center font-sansMed text-xs text-textMuted" style={{ width: '14.28%' }}>
                {day}
              </Text>
            ))}
          </View>
          <View className="mb-4 flex-row flex-wrap">
            {calendarDays.map((cell, index) =>
              cell ? (
                <View key={cell.dateKey} style={{ width: '14.28%' }}>
                  <CalendarCell
                    day={cell.day}
                    netAmount={spendByDayFiltered.get(cell.dateKey)?.net ?? null}
                    hasReimbursement={spendByDayFiltered.get(cell.dateKey)?.hasReimbursement ?? false}
                    isToday={cell.dateKey === todayKey}
                    isSelected={cell.dateKey === selectedDay}
                    onPress={() => setSelectedDay(cell.dateKey === selectedDay ? null : cell.dateKey)}
                  />
                </View>
              ) : (
                <View key={`empty-${index}`} style={{ width: '14.28%' }} />
              ),
            )}
          </View>

          <View className="mb-4 flex-row justify-between rounded-md bg-surface p-4">
            <Text className="font-mono text-sm text-income">Income {formatAmount(monthSummary.income)}</Text>
            <Text className="font-mono text-sm text-expense">Expenses {formatAmount(monthSummary.expense)}</Text>
            <Text className="font-mono text-sm text-textPrimary">Net {formatAmount(monthSummary.net)}</Text>
          </View>

          {selectedDay ? (
            <FlatList
              data={selectedDayItems}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 96 }}
              renderItem={({ item }) => {
                const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
                return (
                  <TransactionRow
                    item={item}
                    categoryName={category?.name ?? 'Uncategorized'}
                    categoryColor={category?.color ?? colors.textMuted}
                    categoryIcon={category?.icon ?? '❓'}
                    reimbursementCategoryName={item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null}
                    onPress={() => handleRowPress(item)}
                  />
                )
              }}
            />
          ) : null}
        </View>
      )}

      <Pressable
        onPress={() => {
          setEditingManualId(null)
          setManualSheetOpen(true)
        }}
        accessibilityLabel="Add Transaction"
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary"
        style={{ shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </Pressable>

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
        onClose={() => setReimbursementItem(null)}
        onSave={handleSaveReimbursement}
      />
      <ManualTransactionSheet
        visible={manualSheetOpen}
        transaction={editingManual}
        categories={categories.data ?? []}
        subcategories={subcategories.data ?? []}
        isSaving={manualTransactions.isLoading}
        onClose={() => {
          setManualSheetOpen(false)
          setEditingManualId(null)
        }}
        onSave={handleSaveManual}
        onDelete={editingManualId ? handleDeleteManual : undefined}
      />
    </SafeAreaView>
  )
}
