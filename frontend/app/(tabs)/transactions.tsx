import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { useTransactionEditor } from '@/hooks/useTransactionEditor'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransfers } from '@/hooks/useTransfers'
import { DayGroupedTransactions } from '@/components/transactions/DayGroupedTransactions'
import { MonthNavigator } from '@/components/transactions/MonthNavigator'
import { CalendarCell } from '@/components/transactions/CalendarCell'
import { AccountsFilterDropdown } from '@/components/ui/AccountsFilterDropdown'
import { TransactionEditSheets } from '@/components/transactions/TransactionEditSheets'
import { TransferSuggestionsBanner, TransferSuggestionsSheet } from '@/components/transfers/TransferSuggestionsSheet'
import { useTransferDismissals } from '@/hooks/useTransferDismissals'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { formatAmount } from '@/lib/format/money'
import { filterByMonth, shiftMonth } from '@/lib/transactions/filterByMonth'
import { useSelectedMonth } from '@/hooks/useSelectedMonth'
import { aggregateMonth } from '@/lib/transactions/aggregateMonth'
import type { TransferSuggestion } from '@/hooks/useTransactionFeed'

export default function TransactionsScreen() {
  const { categoryId: categoryIdParam } = useLocalSearchParams<{ categoryId?: string }>()
  const [month, setMonth] = useSelectedMonth()
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(categoryIdParam ?? null)
  const [suggestionsSheetOpen, setSuggestionsSheetOpen] = useState(false)
  // Only for the suggestion actions below. Everything the edit sheets can fail at reports through
  // the editor's own saveError.
  const [suggestionError, setSuggestionError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const scrollRef = useRef<ScrollView>(null)
  const sectionOffsets = useRef(new Map<string, number>())

  const { feed, categoryById, transferSuggestions, pendingTransferPreviews, isLoading, error } = useTransactionFeed()
  // Every edit sheet — category, transfer, manual — and all the state behind them. Shared with the
  // dashboard's category drill-down and the account sheet, so tapping a row behaves the same anywhere.
  const editor = useTransactionEditor(feed)
  const transferDismissals = useTransferDismissals()
  const accounts = useAccounts()
  const transfers = useTransfers()

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

  useEffect(() => {
    const liveDates = new Set(filteredFeed.map((item) => item.date))
    for (const date of sectionOffsets.current.keys()) {
      if (!liveDates.has(date)) sectionOffsets.current.delete(date)
    }
  }, [filteredFeed])

  useEffect(() => {
    setSelectedDate(null)
  }, [month])

  const handleDatePress = useCallback((dateKey: string) => {
    setSelectedDate(dateKey)
    const y = sectionOffsets.current.get(dateKey)
    if (y == null) return
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true })
  }, [])

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

  // Suggestion legs are always Plaid-sourced (detection eligibility), so the plaid id
  // fields are correct on both sides. Confirming creates a normal manual-source transfer —
  // the user vouched for it, exactly as if they'd built it in the TransferSheet.
  async function handleConfirmSuggestion(suggestion: TransferSuggestion) {
    try {
      await transfers.create({
        kind: suggestion.kind,
        expensePlaidTransactionId: suggestion.expense.id,
        expenseManualTransactionId: null,
        incomePlaidTransactionId: suggestion.income.id,
        incomeManualTransactionId: null,
        amount: suggestion.amount.toFixed(2),
        note: null,
      })
    } catch (err) {
      setSuggestionError(err instanceof Error ? err.message : 'Could not link this transfer. Try again.')
    }
  }

  async function handleDismissSuggestion(suggestion: TransferSuggestion) {
    try {
      await transferDismissals.create({ expensePlaidTransactionId: suggestion.expense.id })
    } catch (err) {
      setSuggestionError(err instanceof Error ? err.message : 'Could not dismiss this suggestion. Try again.')
    }
  }

  if (isLoading) return <LoadingScreen />

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="flex-row items-center px-5 py-3">
        <View className="flex-1 flex-row">
          <AccountsFilterDropdown accounts={accounts.data ?? []} selectedAccountId={selectedAccountId} onSelect={setSelectedAccountId} />
        </View>
        <MonthNavigator month={month} onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} onSelect={setMonth} />
        <View className="flex-1 items-end">
          <Pressable onPress={editor.openNewManual} accessibilityLabel="Add Transaction">
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
      {editor.saveError ? <ErrorBanner message={editor.saveError} onDismiss={editor.dismissSaveError} /> : null}
      {suggestionError ? <ErrorBanner message={suggestionError} onDismiss={() => setSuggestionError(null)} /> : null}

      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 40 }}>
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
                    isSelected={cell.dateKey === selectedDate}
                    onPress={() => handleDatePress(cell.dateKey)}
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

        {transferSuggestions.length + pendingTransferPreviews.length > 0 ? (
          <View className="mx-5 mb-4">
            <TransferSuggestionsBanner count={transferSuggestions.length + pendingTransferPreviews.length} onPress={() => setSuggestionsSheetOpen(true)} />
          </View>
        ) : null}

        {/* Transaction list grouped by date */}
        {filteredFeed.length === 0 ? (
          <View className="px-5 py-8">
            <Text className="text-center font-sans text-sm text-textMuted">No transactions this month</Text>
          </View>
        ) : (
          <DayGroupedTransactions
            items={filteredFeed}
            cardClassName="mx-5 mb-3 rounded-xl bg-surface px-4"
            categoryFor={(item) => {
              const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
              return {
                name: category?.name ?? 'Uncategorized',
                color: category?.color ?? colors.textMuted,
                icon: category?.icon ?? null,
              }
            }}
            reimbursementCategoryNameFor={(item) =>
              item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null
            }
            onItemPress={editor.openTransaction}
            onDayLayout={(date, y) => sectionOffsets.current.set(date, y)}
          />
        )}
      </ScrollView>

      <TransactionEditSheets editor={editor} />
      <TransferSuggestionsSheet
        visible={suggestionsSheetOpen}
        suggestions={transferSuggestions}
        pendingPreviews={pendingTransferPreviews}
        accounts={accounts.data ?? []}
        onClose={() => setSuggestionsSheetOpen(false)}
        onConfirm={handleConfirmSuggestion}
        onDismiss={handleDismissSuggestion}
      />
    </SafeAreaView>
  )
}
