import { Pressable, Text, View } from 'react-native'
import { shadow } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'
import { BudgetProgressBar } from './BudgetProgressBar'

interface BudgetCardProps {
  categoryName: string
  categoryIcon: string
  spent: number
  budget: number
  onPress?: () => void
}

function statusIcon(percent: number): string {
  if (percent > 100) return '🔴'
  if (percent >= 70) return '⚠️'
  return '✓'
}

export function BudgetCard({ categoryName, categoryIcon, spent, budget, onPress }: BudgetCardProps) {
  const percent = budget > 0 ? (spent / budget) * 100 : 0

  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="gap-2 rounded-md bg-surface p-4" style={shadow.sm}>
      <View className="flex-row items-center gap-2">
        <Text style={{ fontSize: 18 }}>{categoryIcon}</Text>
        <Text className="font-sansSemi text-base text-textPrimary">{categoryName}</Text>
      </View>
      <Text className="font-mono text-sm text-textSecondary">
        {formatAmount(spent)} / {formatAmount(budget)}
      </Text>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <BudgetProgressBar percent={percent} />
        </View>
        <Text className="font-sansMed text-sm text-textSecondary">{Math.round(percent)}%</Text>
        <Text>{statusIcon(percent)}</Text>
      </View>
    </Pressable>
  )
}
