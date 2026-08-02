import { Pressable, Text } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { colors } from '@/constants/theme'

interface CalendarCellProps {
  day: number
  netAmount: number | null // positive = net expense, negative = net income, null = no activity
  hasReimbursement: boolean
  isToday: boolean
  isSelected: boolean
  onPress: () => void
}

export function CalendarCell({ day, netAmount, hasReimbursement, isToday, isSelected, onPress }: CalendarCellProps) {
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  function handlePress() {
    scale.value = withSpring(0.95, { duration: 100 }, () => {
      scale.value = withSpring(1, { duration: 100 })
    })
    onPress()
  }

  const amountColor = netAmount == null ? colors.textMuted : netAmount < 0 ? colors.income : colors.expense
  const dateColor = isToday ? colors.primary : netAmount != null ? colors.textPrimary : colors.textMuted

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        className="aspect-square items-center justify-center rounded-md"
        style={{
          backgroundColor: isToday ? colors.primaryMuted : isSelected ? colors.surfaceRaised : 'transparent',
          borderWidth: isSelected ? 1 : 0,
          borderColor: colors.primary,
        }}
      >
        <Text className="font-sansMed text-sm" style={{ color: dateColor }}>
          {day}
        </Text>
        {netAmount != null ? (
          <Text className="font-mono text-xs" style={{ color: amountColor }}>
            {hasReimbursement ? '*' : ''}${Math.abs(netAmount).toFixed(2)}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}
