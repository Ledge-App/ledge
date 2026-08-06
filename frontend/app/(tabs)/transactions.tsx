import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { useAccounts } from '@/hooks/useAccounts'
import { useTransactionEditor } from '@/hooks/useTransactionEditor'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { MonthNavigator } from '@/components/transactions/MonthNavigator'
import { CalendarCell } from '@/components/transactions/CalendarCell'
import { AccountsFilterDropdown } from '@/components/ui/AccountsFilterDropdown'
import { TransactionEditSheets } from '@/components/transactions/TransactionEditSheets'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { formatAmount } from '@/lib/format/money'
import { currentMonth, filterByMonth, shiftMonth } from '@/lib/transactions/filterByMonth'
import { aggregateMonth } from '@/lib/transactions/aggregateMonth'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

export default function TransactionsScreen() {
  const { categoryId: categoryIdParam } = useLocalSearchParams<{ categoryId?: string }>()
  const [month, setMonth] = useState(currentMonth())
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(categoryIdParam ?? null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const scrollRef = useRef<ScrollView>(null)
  const sectionOffsets = useRef(new Map<string, number>())

  const { feed, categoryById, isLoading, error } = useTransactionFeed()
  const accounts = useAccounts()
  const editor = useTransactionEditor(feed)

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

  // Drop offsets for dates that no longer have a section. Sections that survive keep theirs —
  // onLayout only re-fires when a view actually moves, so clearing the whole map would strand
  // any section whose position happened not to change.
  useEffect(() => {
    const liveDates = new Set(sections.map((section) => section.title))
    for (const date of sectionOffsets.current.keys()) {
      if (!liveDates.has(date)) sectionOffsets.current.delete(date)
    }
  }, [sections])

  // The selected day belongs to the month it was tapped in.
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

  if (isLoading) return <LoadingScreen />

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="flex-row items-center px-5 py-3">
        <View className="flex-1 flex-row">
          <AccountsFilterDropdown accounts={accounts.data ?? []} selectedAccountId={selectedAccountId} onSelect={setSelectedAccountId} />
        </View>
        <MonthNavigator month={month} onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
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
              <View
                key={section.title}
                className="mx-5 mb-3 rounded-xl bg-surface px-4"
                onLayout={(event) => {
                  sectionOffsets.current.set(section.title, event.nativeEvent.layout.y)
                }}
              >
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
                        onPress={() => editor.openTransaction(item)}
                      />
                    </View>
                  )
                })}
              </View>
            )
          })
        )}
      </ScrollView>

      <TransactionEditSheets editor={editor} />
    </SafeAreaView>
  )
}
