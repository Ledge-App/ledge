import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
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
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { formatAmount } from '@/lib/format/money'
import { currentMonth, filterByMonth, shiftMonth } from '@/lib/transactions/filterByMonth'
import { aggregateMonth } from '@/lib/transactions/aggregateMonth'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { ManualTransaction } from '@/types/domain'

export default function TransactionsScreen() {
  const { categoryId: categoryIdParam } = useLocalSearchParams<{ categoryId?: string }>()
  const [month, setMonth] = useState(currentMonth())
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(categoryIdParam ?? null)
  const [activeSheetItem, setActiveSheetItem] = useState<FeedItem | null>(null)
  const [reimbursementItem, setReimbursementItem] = useState<FeedItem | null>(null)
  const [manualSheetOpen, setManualSheetOpen] = useState(false)
  const [editingManualId, setEditingManualId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

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

  const filteredFeed = useMemo(
    () => (categoryFilter ? monthFeed.filter((item) => item.categoryId === categoryFilter) : monthFeed),
    [monthFeed, categoryFilter],
  )

  useEffect(() => {
    setCategoryFilter(categoryIdParam ?? null)
  }, [categoryIdParam])

  const sections = useMemo(() => {
    const byDate = new Map<string, FeedItem[]>()
    for (const item of filteredFeed) {
      const bucket = byDate.get(item.date) ?? []
      bucket.push(item)
      byDate.set(item.date, bucket)
    }
    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({ title: date, data: items }))
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

  const { spendByDay, totalExpense, totalIncome } = useMemo(() => aggregateMonth(filteredFeed), [filteredFeed])

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

  const candidateIncomeItems = feed.filter(
    (item) => item.amount < 0 && item.id !== reimbursementItem?.id && !item.isReimbursementIncome,
  )

  if (isLoading) return <LoadingScreen />

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="flex-row items-center px-5 py-3">
        <View className="flex-1 flex-row">
          <AccountsFilterDropdown accounts={accounts.data ?? []} selectedAccountId={selectedAccountId} onSelect={setSelectedAccountId} />
        </View>
        <MonthNavigator month={month} onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
        <View className="flex-1 items-end">
          <Pressable
            onPress={() => {
              setEditingManualId(null)
              setManualSheetOpen(true)
            }}
            accessibilityLabel="Add Transaction"
          >
            <Ionicons name="add-circle-outline" size={24} color={colors.textPrimary} />
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

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Calendar */}
        <View className="mx-5 mb-4 rounded-xl bg-surface p-3">
          <View className="mb-1 flex-row">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <Text key={day} className="text-center font-sansMed text-xs text-textMuted" style={{ width: '14.28%' }}>
                {day}
              </Text>
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {calendarDays.map((cell, index) =>
              cell ? (
                <View key={cell.dateKey} style={{ width: '14.28%' }}>
                  <CalendarCell
                    day={cell.day}
                    netAmount={spendByDay.get(cell.dateKey)?.net ?? null}
                    hasReimbursement={spendByDay.get(cell.dateKey)?.hasReimbursement ?? false}
                    isToday={cell.dateKey === todayKey}
                    isSelected={false}
                    onPress={() => {}}
                  />
                </View>
              ) : (
                <View key={`empty-${index}`} style={{ width: '14.28%' }} />
              ),
            )}
          </View>

          <View className="mt-3 flex-row justify-between border-t px-2 pt-3" style={{ borderColor: colors.border }}>
            <View className="items-start">
              <Text className="font-sans text-xs text-textMuted">Income</Text>
              <Text className="font-display text-md text-income">{formatAmount(totalIncome)}</Text>
            </View>
            <View className="items-center">
              <Text className="font-sans text-xs text-textMuted">Expenses</Text>
              <Text className="font-display text-md text-expense">{formatAmount(totalExpense)}</Text>
            </View>
            <View className="items-end">
              <Text className="font-sans text-xs text-textMuted">Balance</Text>
              <Text className="font-display text-md text-textPrimary">{formatAmount(totalIncome - totalExpense)}</Text>
            </View>
          </View>
        </View>

        {/* Transaction list grouped by date */}
        {filteredFeed.length === 0 ? (
          <View className="px-5 py-8">
            <Text className="text-center font-sans text-sm text-textMuted">No transactions this month</Text>
          </View>
        ) : (
          sections.map((section) => {
            const date = new Date(section.title + 'T00:00:00')
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            const dayOfWeek = dayNames[date.getDay()]
            const monthDay = `${date.getMonth() + 1}/${date.getDate()}`
            const incomeTotal = section.data.filter((i) => i.amount < 0 && !i.isReimbursementIncome).reduce((s, i) => s + Math.abs(i.netAmount ?? i.amount), 0)
            const expenseTotal = section.data.filter((i) => i.amount > 0).reduce((s, i) => s + (i.netAmount ?? i.amount), 0)

            return (
              <View key={section.title} className="mx-5 mb-3 rounded-xl bg-surface px-4">
                <View className="flex-row items-center justify-between py-3">
                  <Text className="font-sansSemi text-sm text-textPrimary">{monthDay} {dayOfWeek}</Text>
                  <View className="flex-row gap-3">
                    {incomeTotal > 0 ? <Text className="font-sans text-xs text-income">IN {formatAmount(incomeTotal)}</Text> : null}
                    {expenseTotal > 0 ? <Text className="font-sans text-xs text-expense">OUT {formatAmount(expenseTotal)}</Text> : null}
                  </View>
                </View>
                {section.data.map((item) => {
                  const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
                  return (
                    <View key={item.id} className="border-t" style={{ borderColor: colors.border }}>
                      <TransactionRow
                        item={item}
                        categoryName={category?.name ?? 'Uncategorized'}
                        categoryColor={category?.color ?? colors.textMuted}
                        categoryIcon={category?.icon ?? '❓'}
                        reimbursementCategoryName={item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null}
                        onPress={() => handleRowPress(item)}
                      />
                    </View>
                  )
                })}
              </View>
            )
          })
        )}
      </ScrollView>

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
