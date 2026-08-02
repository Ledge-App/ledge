import { useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { useBudgets } from '@/hooks/useBudgets'
import { useCategories } from '@/hooks/useCategories'
import { BudgetCard } from '@/components/budgets/BudgetCard'
import { BudgetProgressBar } from '@/components/budgets/BudgetProgressBar'
import { MonthNavigator } from '@/components/transactions/MonthNavigator'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { TextField } from '@/components/ui/TextField'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { formatAmount } from '@/lib/format/money'
import { currentMonth, filterByMonth, shiftMonth } from '@/lib/transactions/filterByMonth'
import { aggregateMonth } from '@/lib/transactions/aggregateMonth'
import type { Budget } from '@/types/domain'

export default function BudgetsScreen() {
  const [month, setMonth] = useState(currentMonth())
  const [settingCategoryId, setSettingCategoryId] = useState<string | null>(null)
  const [newAmount, setNewAmount] = useState('')
  const [newPeriod, setNewPeriod] = useState<Budget['period']>('monthly')
  const [saveError, setSaveError] = useState<string | null>(null)

  const { feed, error } = useTransactionFeed()
  const budgets = useBudgets()
  const categories = useCategories()

  const monthFeed = useMemo(() => filterByMonth(feed, month), [feed, month])

  const { spendByCategory } = useMemo(() => aggregateMonth(monthFeed), [monthFeed])

  const categoryById = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data])

  const budgetedRows = useMemo(() => {
    return (budgets.data ?? [])
      .map((budget) => {
        const spent = spendByCategory.get(budget.categoryId) ?? 0
        const percent = Number(budget.amount) > 0 ? (spent / Number(budget.amount)) * 100 : 0
        return { budget, spent, percent }
      })
      .sort((a, b) => b.percent - a.percent)
  }, [budgets.data, spendByCategory])

  const unbudgetedCategories = useMemo(() => {
    const budgetedIds = new Set((budgets.data ?? []).map((b) => b.categoryId))
    return (categories.data ?? []).filter((c) => !budgetedIds.has(c.id))
  }, [categories.data, budgets.data])

  const totalSpent = (budgets.data ?? []).reduce((sum, b) => sum + (spendByCategory.get(b.categoryId) ?? 0), 0)
  const totalBudget = (budgets.data ?? []).reduce((sum, b) => sum + Number(b.amount), 0)
  const overallPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

  const isValidAmount = /^\d+(\.\d{1,2})?$/.test(newAmount) && Number(newAmount) > 0

  async function handleSetBudget() {
    if (!settingCategoryId || !isValidAmount) return
    try {
      await budgets.create({ categoryId: settingCategoryId, amount: newAmount, period: newPeriod })
      setSettingCategoryId(null)
      setNewAmount('')
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this budget. Try again.')
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerClassName="gap-4 px-5 py-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sansSemi text-lg text-textPrimary">Budgets</Text>
          <MonthNavigator month={month} onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
        </View>

        {error ? <ErrorBanner message="Something went wrong loading your budgets." /> : null}
        {saveError ? <ErrorBanner message={saveError} onDismiss={() => setSaveError(null)} /> : null}

        <View className="gap-2">
          <Text className="font-sans text-base text-textSecondary">
            Overall {formatAmount(totalSpent)} / {formatAmount(totalBudget)}
          </Text>
          <BudgetProgressBar percent={overallPercent} />
        </View>

        <View className="gap-3">
          {budgetedRows.map(({ budget, spent }) => (
            <BudgetCard
              key={budget.id}
              categoryName={categoryById.get(budget.categoryId)?.name ?? 'Unknown'}
              categoryIcon={categoryById.get(budget.categoryId)?.icon ?? '❓'}
              spent={spent}
              budget={Number(budget.amount)}
              onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { categoryId: budget.categoryId } })}
            />
          ))}
        </View>

        {unbudgetedCategories.length > 0 ? (
          <View className="gap-2">
            <Text className="font-sansMed text-sm text-textMuted">No budget set</Text>
            {unbudgetedCategories.map((category) => (
              <View key={category.id} className="flex-row items-center justify-between rounded-md bg-surface p-4">
                <View className="flex-row items-center gap-2">
                  <Text style={{ fontSize: 18 }}>{category.icon}</Text>
                  <Text className="font-sansMed text-base text-textPrimary">{category.name}</Text>
                </View>
                <Text
                  onPress={() => setSettingCategoryId(category.id)}
                  className="font-sansMed text-sm text-primary"
                >
                  Set
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <BottomSheet visible={settingCategoryId != null} onClose={() => setSettingCategoryId(null)}>
        <Text className="mb-4 font-sansSemi text-lg text-textPrimary">Set Budget</Text>
        <TextField label="Amount" value={newAmount} onChangeText={setNewAmount} keyboardType="decimal-pad" placeholder="200.00" mono />
        <View className="mt-4">
          <SegmentedControl
            options={[
              { label: 'Weekly', value: 'weekly' as const },
              { label: 'Monthly', value: 'monthly' as const },
              { label: 'Yearly', value: 'yearly' as const },
            ]}
            value={newPeriod}
            onChange={setNewPeriod}
          />
        </View>
        <View className="mt-4">
          <Button label="Save Budget" onPress={handleSetBudget} disabled={!isValidAmount} />
        </View>
      </BottomSheet>
    </SafeAreaView>
  )
}
