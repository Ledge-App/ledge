import { useMemo } from 'react'
import { Pressable, SectionList, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, hexToRgba } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Account, Category } from '@/types/domain'

interface AccountDetailSheetProps {
  visible: boolean
  account: Account | null
  feed: FeedItem[]
  categoryById: Map<string, Category>
  onClose: () => void
  onTransactionPress?: (item: FeedItem) => void
}

const variantIcons: Record<string, { name: string; color: string }> = {
  cash: { name: 'wallet', color: '#3B82F6' },
  investment: { name: 'trending-up', color: '#E11D48' },
  credit: { name: 'card', color: '#6B7280' },
}

function getVariant(type: string): string {
  if (type === 'credit' || type === 'loan') return 'credit'
  if (type === 'investment' || type === 'brokerage') return 'investment'
  return 'cash'
}

export function AccountDetailSheet({ visible, account, feed, categoryById, onClose, onTransactionPress }: AccountDetailSheetProps) {
  const insets = useSafeAreaInsets()

  const accountFeed = useMemo(
    () => (account ? feed.filter((item) => item.accountId === account.account_id) : []),
    [feed, account],
  )

  const sections = useMemo(() => {
    const byDate = new Map<string, FeedItem[]>()
    for (const item of accountFeed) {
      const bucket = byDate.get(item.date) ?? []
      bucket.push(item)
      byDate.set(item.date, bucket)
    }
    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({ title: date, data: items }))
  }, [accountFeed])

  if (!account) return null

  const variant = getVariant(account.type)
  const icon = variantIcons[variant] ?? variantIcons.cash
  const balance = account.balances?.current ?? 0
  const balanceColor = variant === 'credit' ? colors.expense : colors.textPrimary

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
        <Text className="flex-1 text-center font-display text-md text-textPrimary" numberOfLines={1}>{account.name}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View className="mx-5 mb-4 items-center rounded-xl p-5" style={{ backgroundColor: hexToRgba(icon.color, 0.08) }}>
        <View className="mb-3 h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: hexToRgba(icon.color, 0.18) }}>
          <Ionicons name={icon.name as any} size={24} color={icon.color} />
        </View>
        <Text className="font-display text-xl" style={{ color: balanceColor }}>
          {formatAmount(balance)}
        </Text>
      </View>

      <Text className="mb-2 px-5 font-sansSemi text-sm text-textSecondary">Transactions</Text>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
        renderSectionHeader={({ section }) => {
          const date = new Date(section.title + 'T00:00:00')
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          const dayOfWeek = dayNames[date.getDay()]
          const monthDay = `${date.getMonth() + 1}/${date.getDate()}`
          const incomeTotal = section.data.filter((i) => i.amount < 0 && !i.isReimbursementIncome).reduce((s, i) => s + Math.abs(i.netAmount ?? i.amount), 0)
          const expenseTotal = section.data.filter((i) => i.amount > 0).reduce((s, i) => s + (i.netAmount ?? i.amount), 0)
          return (
            <View className="flex-row items-center justify-between bg-surface pb-1 pt-3">
              <Text className="font-sansSemi text-sm text-textPrimary">{monthDay} {dayOfWeek}</Text>
              <View className="flex-row gap-3">
                {incomeTotal > 0 ? <Text className="font-sans text-xs text-income">IN {formatAmount(incomeTotal)}</Text> : null}
                {expenseTotal > 0 ? <Text className="font-sans text-xs text-expense">OUT {formatAmount(expenseTotal)}</Text> : null}
              </View>
            </View>
          )
        }}
        renderItem={({ item }) => {
          const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
          return (
            <TransactionRow
              item={item}
              categoryName={category?.name ?? 'Uncategorized'}
              categoryColor={category?.color ?? colors.textMuted}
              categoryIcon={category?.icon ?? '❓'}
              reimbursementCategoryName={item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null}
              onPress={onTransactionPress ? () => onTransactionPress(item) : undefined}
            />
          )
        }}
        ListEmptyComponent={
          <Text className="py-8 text-center font-sans text-sm text-textMuted">No transactions for this account</Text>
        }
      />
    </BottomSheet>
  )
}
