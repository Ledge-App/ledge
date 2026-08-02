import { useMemo, useState } from 'react'
import { Alert, Pressable, SectionList, Text, View } from 'react-native'
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
  const [month, setMonth] = useState(currentMonth())
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
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

  const sections = useMemo(() => {
    const byDate = new Map<string, FeedItem[]>()
    for (const item of monthFeed) {
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
  }, [monthFeed])

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
        <Ionicons name="list" size={20} color={colors.primary} />
      </View>

      {error ? <ErrorBanner message="Something went wrong loading your transactions." /> : null}
      {saveError ? <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} /> : null}

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
