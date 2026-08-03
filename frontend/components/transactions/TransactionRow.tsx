import { Pressable, Text, View } from 'react-native'
import { colors, hexToRgba } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

interface TransactionRowProps {
  item: FeedItem
  categoryName: string
  categoryColor: string
  categoryIcon: string
  reimbursementCategoryName: string | null
  onPress?: () => void
}

export function TransactionRow({ item, categoryName, categoryColor, categoryIcon, reimbursementCategoryName, onPress }: TransactionRowProps) {
  const isIncome = item.amount < 0
  const amountColor = isIncome ? colors.income : colors.expense
  const iconColor = item.isReimbursementIncome ? colors.reimbursed : categoryColor
  const iconBg = item.isReimbursementIncome ? hexToRgba(colors.reimbursed, 0.18) : hexToRgba(categoryColor, 0.18)

  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 py-3">
      <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: iconBg }}>
        <Text style={{ fontSize: 18, color: iconColor }}>{item.isReimbursementIncome ? '↩️' : categoryIcon}</Text>
        {item.source === 'manual' ? (
          <View className="absolute -bottom-0.5 -right-0.5 h-4 w-4 items-center justify-center rounded-full bg-surface">
            <Text style={{ fontSize: 10 }}>✏️</Text>
          </View>
        ) : null}
      </View>

      <View className="flex-1 gap-0.5">
        <Text className="font-sansSemi text-base text-textPrimary">
          {item.isReimbursementIncome
            ? reimbursementCategoryName
              ? `Reimbursement · ${reimbursementCategoryName}`
              : 'Reimbursement'
            : categoryName}
        </Text>
        <Text className="font-sans text-sm text-textSecondary" numberOfLines={1}>
          {item.merchantName}
        </Text>
      </View>

      <View className="items-end gap-0.5">
        {item.reimbursedAmount != null && item.netAmount != null ? (
          <Text className="font-mono text-base" style={{ color: colors.reimbursed }}>
            [{formatAmount(item.amount)} → {formatAmount(item.netAmount)}]
          </Text>
        ) : (
          <Text className="font-mono text-base" style={{ color: amountColor }}>
            {isIncome ? '+' : '-'}{formatAmount(Math.abs(item.amount))}
          </Text>
        )}
        {item.confidenceLevel === 'MEDIUM' ? <Text style={{ fontSize: 11 }}>❓</Text> : null}
      </View>
    </Pressable>
  )
}
