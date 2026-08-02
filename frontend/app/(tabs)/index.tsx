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
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { BudgetCard } from '@/components/budgets/BudgetCard'
import { MonthNavigator } from '@/components/transactions/MonthNavigator'
import { AccountsFilterDropdown } from '@/components/ui/AccountsFilterDropdown'
import { CategorySheet } from '@/components/transactions/CategorySheet'
import { ReimbursementSheet } from '@/components/reimbursements/ReimbursementSheet'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { formatAmount } from '@/lib/format/money'
import { currentMonth, filterByMonth, shiftMonth } from '@/lib/transactions/filterByMonth'
import { aggregateMonth } from '@/lib/transactions/aggregateMonth'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

export default function DashboardScreen() {
  const [month, setMonth] = useState(currentMonth())
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [expensesOpen, setExpensesOpen] = useState(true)
  const [incomeOpen, setIncomeOpen] = useState(true)
  const [activeSheetItem, setActiveSheetItem] = useState<FeedItem | null>(null)
  const [reimbursementItem, setReimbursementItem] = useState<FeedItem | null>(null)
  const [pendingReimbursementMeta, setPendingReimbursementMeta] = useState<{ categoryId: string; subcategoryId: string | null } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

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

  const recentTransactions = accountFilteredFeed.slice(0, 5)

  const budgetHealthCards = useMemo(() => {
    if (!budgets.data) return []
    return budgets.data
      .map((budget) => {
        const spent = spendByCategory.get(budget.categoryId) ?? 0
        const percent = Number(budget.amount) > 0 ? (spent / Number(budget.amount)) * 100 : 0
        return { budget, spent, percent }
      })
      .filter(({ percent }) => percent >= 80)
      .sort((a, b) => b.percent - a.percent)
  }, [budgets.data, spendByCategory])

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

  const candidateIncomeItems = accountFilteredFeed.filter((item) => item.amount < 0 && item.id !== reimbursementItem?.id)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerClassName="gap-6 px-5 py-4">
        <View className="flex-row items-center justify-between">
          <AccountsFilterDropdown accounts={accounts.data ?? []} selectedAccountId={selectedAccountId} onSelect={setSelectedAccountId} />
          <MonthNavigator month={month} onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
          <Ionicons name="paw" size={22} color={colors.textMuted} style={{ opacity: 0.4 }} />
        </View>

        {error ? <ErrorBanner message="Something went wrong loading your data." /> : null}
        {saveError ? <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} /> : null}

        <Pressable onPress={() => setExpensesOpen((v) => !v)} className="flex-row items-center gap-2">
          <Text className="font-sansSemi text-lg text-expense">Expenses {formatAmount(totalExpense)}</Text>
          <Ionicons name={expensesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.expense} />
        </Pressable>
        {expensesOpen ? (
          <View className="flex-row flex-wrap gap-3">
            {(categories.data?.filter((c) => spendByCategory.has(c.id)) ?? []).map((category) => (
              <View key={category.id} className="w-[48%]">
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

        <Pressable onPress={() => setIncomeOpen((v) => !v)} className="flex-row items-center gap-2">
          <Text className="font-sansSemi text-lg text-income">Income {formatAmount(totalIncome)}</Text>
          <Ionicons name={incomeOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.income} />
        </Pressable>
        {incomeOpen ? (
          <View className="flex-row flex-wrap gap-3">
            {(categories.data?.filter((c) => incomeByCategory.has(c.id)) ?? []).map((category) => (
              <View key={category.id} className="w-[48%]">
                <CategoryCard name={category.name} icon={category.icon} color={category.color} spent={incomeByCategory.get(category.id) ?? 0} budget={null} />
              </View>
            ))}
          </View>
        ) : null}

        {budgetHealthCards.length > 0 ? (
          <View className="gap-2">
            <Text className="font-sansSemi text-base text-textPrimary">Budget Health</Text>
            {budgetHealthCards.map(({ budget, spent }) => {
              const category = categoryById.get(budget.categoryId)
              return (
                <BudgetCard
                  key={budget.id}
                  categoryName={category?.name ?? 'Unknown'}
                  categoryIcon={category?.icon ?? '❓'}
                  spent={spent}
                  budget={Number(budget.amount)}
                />
              )
            })}
          </View>
        ) : null}

        <View className="gap-2">
          <Text className="font-sansSemi text-base text-textPrimary">Recent Transactions</Text>
          {recentTransactions.map((item) => {
            const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
            return (
              <TransactionRow
                key={item.id}
                item={item}
                categoryName={category?.name ?? 'Uncategorized'}
                categoryColor={category?.color ?? colors.textMuted}
                categoryIcon={category?.icon ?? '❓'}
                reimbursementCategoryName={item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null}
                onPress={
                  item.source === 'plaid'
                    ? () => setActiveSheetItem(item)
                    : undefined
                }
              />
            )
          })}
        </View>
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
        onClose={() => {
          setReimbursementItem(null)
          setPendingReimbursementMeta(null)
        }}
        onSave={handleSaveReimbursement}
      />
    </SafeAreaView>
  )
}
