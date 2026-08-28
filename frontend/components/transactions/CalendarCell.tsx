import { memo } from 'react'
import { Pressable, Text } from 'react-native'
import { colors } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'

interface CalendarCellProps {
  /** Passed back to onPress so the grid can share one callback across all 42 cells. */
  dateKey: string
  day: number
  netAmount: number | null
  hasReimbursement: boolean
  isToday: boolean
  isSelected: boolean
  onPress: (dateKey: string) => void
}

function CalendarCellComponent({ dateKey, day, netAmount, isToday, isSelected, onPress }: CalendarCellProps) {
  const amountColor = netAmount == null ? colors.textMuted : netAmount < 0 ? colors.income : colors.expense
  const dateColor = isToday ? colors.textInverse : colors.textPrimary

  return (
    <Pressable
      onPress={() => onPress(dateKey)}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      className="items-center justify-center py-2"
      style={{
        backgroundColor: isSelected ? colors.surfaceRaised : 'transparent',
      }}
    >
      <Text
        className="font-sansMed text-sm"
        style={{
          color: dateColor,
          backgroundColor: isToday ? colors.expense : 'transparent',
          borderRadius: 12,
          overflow: 'hidden',
          width: 24,
          height: 24,
          lineHeight: 24,
          textAlign: 'center',
        }}
      >
        {day}
      </Text>
      {netAmount != null ? (
        <Text className="font-sans" style={{ color: amountColor, fontSize: 9, marginTop: 2 }}>
          ${Math.abs(netAmount).toFixed(netAmount > 999 ? 0 : 2)}
        </Text>
      ) : null}
    </Pressable>
  )
}

/** Memoized: 42 of these re-rendered on every sheet open before this. */
export const CalendarCell = memo(CalendarCellComponent)
