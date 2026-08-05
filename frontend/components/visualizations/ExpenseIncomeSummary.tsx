import { Pressable, Text, View } from 'react-native'
import { colors } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'

interface ExpenseIncomeSummaryProps {
  mode: 'expense' | 'income'
  onToggle: (mode: 'expense' | 'income') => void
  totalExpense: number
  totalIncome: number
}

export function ExpenseIncomeSummary({ mode, onToggle, totalExpense, totalIncome }: ExpenseIncomeSummaryProps) {
  return (
    <View className="flex-row items-start justify-center" style={{ gap: 40 }}>
      <Pressable onPress={() => onToggle('expense')} className="items-center gap-1" accessibilityRole="button">
        <View
          className="rounded-full px-3"
          style={[{ paddingVertical: 3 }, mode === 'expense' && { backgroundColor: 'rgba(225,29,72,0.12)' }]}
        >
          <Text className="font-sansSemi text-sm" style={{ color: mode === 'expense' ? colors.expense : colors.textMuted }}>
            Expenses
          </Text>
        </View>
        <Text className="font-display text-md" style={{ color: colors.expense }}>
          {formatAmount(totalExpense)}
        </Text>
      </Pressable>

      <Pressable onPress={() => onToggle('income')} className="items-center gap-1" accessibilityRole="button">
        <View
          className="rounded-full px-3"
          style={[{ paddingVertical: 3 }, mode === 'income' && { backgroundColor: 'rgba(5,150,105,0.12)' }]}
        >
          <Text className="font-sansSemi text-sm" style={{ color: mode === 'income' ? colors.income : colors.textMuted }}>
            Income
          </Text>
        </View>
        <Text className="font-display text-md" style={{ color: colors.income }}>
          {formatAmount(totalIncome)}
        </Text>
      </Pressable>
    </View>
  )
}
