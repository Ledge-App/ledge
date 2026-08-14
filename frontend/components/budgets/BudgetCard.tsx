import { Pressable, Text, View } from 'react-native'
import { shadow } from '@/constants/theme'
import { hexToRgba } from '@/constants/theme'
import { CategoryIcon } from '@/components/categories/CategoryIcon'
import { BudgetSplitBar, statusColor } from './BudgetSplitBar'
import type { BudgetStatus } from '@/lib/budgets/budgetMath'

const STATUS_LABEL: Record<BudgetStatus, string> = {
  over: 'Over',
  'at-risk': 'At risk',
  'on-track': 'On track',
}

interface BudgetCardProps {
  categoryName: string
  categoryIcon: string | null
  categoryColor?: string
  spent: number
  amount: number
  status: BudgetStatus
  onPress?: () => void
}

// No pace tick here: the status pill already says how the pace reads, and the labeled tick on
// the overall bar is where "today" lives — one calendar marker on the screen, not five.
export function BudgetCard({ categoryName, categoryIcon, categoryColor, spent, amount, status, onPress }: BudgetCardProps) {
  const chip = statusColor(status)
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="gap-2.5 rounded-md bg-surface p-4" style={shadow.sm}>
      <View className="flex-row items-center gap-2">
        <CategoryIcon icon={categoryIcon} size={18} color={categoryColor} />
        <Text className="flex-1 font-sansSemi text-base text-textPrimary" numberOfLines={1}>
          {categoryName}
        </Text>
        <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: hexToRgba(chip, 0.14) }}>
          <Text className="font-sansMed text-xs" style={{ color: chip }}>
            {STATUS_LABEL[status]}
          </Text>
        </View>
      </View>
      <BudgetSplitBar spent={spent} amount={amount} status={status} paceFraction={null} />
    </Pressable>
  )
}
