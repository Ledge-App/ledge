import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useTransfers } from '@/hooks/useTransfers'
import { useManualTransactions } from '@/hooks/useManualTransactions'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { MonthNavigator } from '@/components/transactions/MonthNavigator'
import { CalendarCell } from '@/components/transactions/CalendarCell'
import { AccountsFilterDropdown } from '@/components/ui/AccountsFilterDropdown'
import { CategorySheet } from '@/components/transactions/CategorySheet'
import { TransferSheet } from '@/components/transfers/TransferSheet'
import { TransferSuggestionsBanner, TransferSuggestionsSheet } from '@/components/transfers/TransferSuggestionsSheet'
import { useTransferDismissals } from '@/hooks/useTransferDismissals'
import { ManualTransactionSheet } from '@/components/transactions/ManualTransactionSheet'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { formatAmount } from '@/lib/format/money'
import { currentMonth, filterByMonth, shiftMonth } from '@/lib/transactions/filterByMonth'
import { aggregateMonth } from '@/lib/transactions/aggregateMonth'
import { countsTowardTotals } from '@/lib/transactions/totals'
import { buildTransferInputs } from '@/lib/transfers/buildTransferInputs'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { ManualTransactionInput } from '@/components/transactions/ManualTransactionSheet'
import type { TransferSuggestion } from '@/hooks/useTransactionFeed'
import type { ManualTransaction, TransferKind } from '@/types/domain'

export default function TransactionsScreen() {
  const { categoryId: categoryIdParam } = useLocalSearchParams<{ categoryId?: string }>()
  const [month, setMonth] = useState(currentMonth())
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string | null>(categoryIdParam ?? null)
  const [activeSheetItem, setActiveSheetItem] = useState<FeedItem | null>(null)
  const [transferItem, setTransferItem] = useState<FeedItem | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<{ kind: TransferKind; counterpartIds: string[] } | null>(null)
  const [transferForcedKind, setTransferForcedKind] = useState<TransferKind | undefined>(undefined)
  const [manualSheetOpen, setManualSheetOpen] = useState(false)
  const [suggestionsSheetOpen, setSuggestionsSheetOpen] = useState(false)
  const [editingManual, setEditingManual] = useState<ManualTransaction | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const scrollRef = useRef<ScrollView>(null)
  const sectionOffsets = useRef(new Map<string, number>())

  const { feed, categoryById, transferSuggestions, isLoading, error } = useTransactionFeed()
  const transferDismissals = useTransferDismissals()
  const accounts = useAccounts()
  const categories = useCategories()
  const subcategories = useSubcategories()
  const overrides = useTransactionOverrides()
  const vendorMappings = useVendorMappings()
  const transfers = useTransfers()
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

  useEffect(() => {
    const liveDates = new Set(sections.map((section) => section.title))
    for (const date of sectionOffsets.current.keys()) {
      if (!liveDates.has(date)) sectionOffsets.current.delete(date)
    }
  }, [sections])

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

  async function handleSaveCategory(input: { categoryId: string | null; subcategoryId: string | null; applyToVendor: boolean }) {
    if (!activeSheetItem) return
    try {
      if (input.categoryId) {
        await overrides.upsert({ plaidTransactionId: activeSheetItem.id, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
        if (input.applyToVendor) {
          await vendorMappings.upsert({ vendorName: activeSheetItem.merchantName, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
        }
      }
      if (pendingTransfer) {
        for (const transferInput of buildTransferInputs(activeSheetItem, pendingTransfer, feed)) {
          await transfers.create(transferInput)
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

  async function handleUnmarkTransfer(item: FeedItem) {
    if (!item.transferId) return
    try {
      // unmark (not delete) also records a dismissal, so auto-detection can't re-create
      // the pair the user just removed on the next scan.
      await transfers.unmark({ id: item.transferId })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not remove this transfer. Try again.')
    }
  }

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
      setSaveError(err instanceof Error ? err.message : 'Could not link this transfer. Try again.')
    }
  }

  async function handleDismissSuggestion(suggestion: TransferSuggestion) {
    try {
      await transferDismissals.create({ expensePlaidTransactionId: suggestion.expense.id })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not dismiss this suggestion. Try again.')
    }
  }

  async function handleSaveManual(input: ManualTransactionInput) {
    try {
      if (editingManual) {
        await manualTransactions.update({ id: editingManual.id, ...input })
      } else {
        await manualTransactions.create(input)
      }
      setManualSheetOpen(false)
      setEditingManual(null)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this transaction. Try again.')
    }
  }

  function editedManualAsFeedItem(input: ManualTransactionInput): FeedItem | null {
    if (!editingManual) return null
    const existing = feed.find((item) => item.id === editingManual.id)
    if (!existing) return null
    return { ...existing, amount: Number(input.amount), date: input.date }
  }

  async function handleSaveManualAndMarkTransfer(input: ManualTransactionInput) {
    const expenseItem = editedManualAsFeedItem(input)
    await handleSaveManual(input)
    if (expenseItem) setTimeout(() => setTransferItem(expenseItem), 400)
  }

  async function handleSaveManualAndUnmarkTransfer(input: ManualTransactionInput) {
    const existing = editedManualAsFeedItem(input)
    await handleSaveManual(input)
    if (existing) await handleUnmarkTransfer(existing)
  }

  function handleDeleteManual() {
    if (!editingManual) return
    const id = editingManual.id
    const feedItem = feed.find((item) => item.id === id)
    const isReimbursed = feedItem?.reimbursedAmount != null || feedItem?.isReimbursementIncome === true
    const isTransferLeg = feedItem?.transferKind != null

    Alert.alert(
      isTransferLeg
        ? 'This transaction is part of a transfer. Deleting it also removes the transfer. Delete anyway?'
        : isReimbursed
          ? 'This transaction is part of a reimbursement. Delete anyway?'
          : 'Delete this transaction?',
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
              setEditingManual(null)
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
      setEditingManual({
        id: item.id,
        amount: Math.abs(item.amount).toFixed(2),
        type: item.amount < 0 ? 'income' : 'expense',
        categoryId: item.categoryId,
        subcategoryId: item.subcategoryId,
        date: item.date,
        note: item.note,
      })
      setManualSheetOpen(true)
    } else {
      setActiveSheetItem(item)
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

  if (isLoading) return <LoadingScreen />

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="flex-row items-center px-5 py-3">
        <View className="flex-1 flex-row">
          <AccountsFilterDropdown accounts={accounts.data ?? []} selectedAccountId={selectedAccountId} onSelect={setSelectedAccountId} />
        </View>
        <MonthNavigator month={month} onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
        <View className="flex-1 items-end">
          <Pressable onPress={() => { setEditingManual(null); setManualSheetOpen(true) }} accessibilityLabel="Add Transaction">
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

        {transferSuggestions.length > 0 ? (
          <View className="mx-5 mb-4">
            <TransferSuggestionsBanner count={transferSuggestions.length} onPress={() => setSuggestionsSheetOpen(true)} />
          </View>
        ) : null}

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
            const incomeTotal = section.data.filter((i) => i.amount < 0 && countsTowardTotals(i)).reduce((s, i) => s + Math.abs(i.netAmount ?? i.amount), 0)
            const expenseTotal = section.data.filter((i) => i.amount > 0 && countsTowardTotals(i)).reduce((s, i) => s + (i.netAmount ?? i.amount), 0)

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
        pendingTransfer={resolvedPendingTransfer}
        onClose={() => { setActiveSheetItem(null); setPendingTransfer(null) }}
        onSave={handleSaveCategory}
        onOpenTransfer={handleOpenTransfer}
        onClearPendingTransfer={() => setPendingTransfer(null)}
        onUnmarkTransfer={async () => {
          if (!activeSheetItem) return
          await handleUnmarkTransfer(activeSheetItem)
          setActiveSheetItem(null)
        }}
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
      <ManualTransactionSheet
        visible={manualSheetOpen}
        transaction={editingManual ?? undefined}
        categories={categories.data ?? []}
        subcategories={subcategories.data ?? []}
        isSaving={manualTransactions.isLoading}
        onClose={() => {
          setManualSheetOpen(false)
          setEditingManual(null)
        }}
        onSave={handleSaveManual}
        onDelete={editingManual ? handleDeleteManual : undefined}
        isTransfer={editingManual ? feed.find((item) => item.id === editingManual.id)?.transferKind != null : false}
        onSaveAndMarkTransfer={handleSaveManualAndMarkTransfer}
        onSaveAndUnmarkTransfer={handleSaveManualAndUnmarkTransfer}
      />
      <TransferSuggestionsSheet
        visible={suggestionsSheetOpen}
        suggestions={transferSuggestions}
        accounts={accounts.data ?? []}
        onClose={() => setSuggestionsSheetOpen(false)}
        onConfirm={handleConfirmSuggestion}
        onDismiss={handleDismissSuggestion}
      />
    </SafeAreaView>
  )
}
