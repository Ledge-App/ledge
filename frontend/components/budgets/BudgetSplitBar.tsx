import { Text, View } from 'react-native'
import { colors, hexToRgba } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'
import type { BudgetStatus } from '@/lib/budgets/budgetMath'

export function statusColor(status: BudgetStatus): string {
  if (status === 'over') return colors.expense
  if (status === 'at-risk') return '#D97706'
  return colors.income
}

interface BudgetSplitBarProps {
  spent: number
  amount: number
  status: BudgetStatus
  /** 0..1 marks "where the calendar says you should be"; null hides the tick (past months). */
  paceFraction: number | null
}

/**
 * The two answers a budget bar owes at a glance: how much is gone, how much is left — spelled
 * out as dollars on either side, not just a percentage. The thin tick is the calendar's pace:
 * a fill short of the tick is money in hand, a fill past it is the month running hot.
 */
export function BudgetSplitBar({ spent, amount, status, paceFraction }: BudgetSplitBarProps) {
  const fraction = amount > 0 ? Math.min(spent / amount, 1) : 0
  const remaining = amount - spent
  const color = statusColor(status)

  return (
    <View className="gap-1.5">
      <View className="flex-row items-baseline justify-between">
        <Text className="font-mono text-sm" style={{ color }}>
          {formatAmount(spent)} <Text className="font-sans text-xs text-textMuted">spent</Text>
        </Text>
        <Text className="font-mono text-sm text-textPrimary">
          {remaining >= 0 ? (
            <>
              {formatAmount(remaining)} <Text className="font-sans text-xs text-textMuted">left</Text>
            </>
          ) : (
            <>
              {formatAmount(Math.abs(remaining))} <Text className="font-sans text-xs text-textMuted">over</Text>
            </>
          )}
        </Text>
      </View>

      <View className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: hexToRgba(color, 0.15) }}>
        <View className="h-full rounded-full" style={{ width: `${fraction * 100}%`, backgroundColor: color }} />
        {paceFraction != null && paceFraction > 0 && paceFraction < 1 ? (
          <View
            className="absolute bottom-0 top-0"
            style={{ left: `${paceFraction * 100}%`, width: 2, backgroundColor: hexToRgba(colors.textPrimary, 0.35) }}
          />
        ) : null}
      </View>
    </View>
  )
}
