import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { colors } from '@/constants/theme'

interface BudgetProgressBarProps {
  percent: number // 0-100+, can exceed 100
}

function barColor(percent: number): string {
  if (percent > 90) return colors.expense
  if (percent >= 70) return colors.warning
  return colors.primary
}

export function BudgetProgressBar({ percent }: BudgetProgressBarProps) {
  const width = useSharedValue(0)
  const pulse = useSharedValue(1)
  const isOver = percent > 100

  useEffect(() => {
    width.value = withTiming(Math.min(percent, 100), { duration: 500, easing: Easing.out(Easing.ease) })
  }, [percent, width])

  useEffect(() => {
    pulse.value = isOver ? withRepeat(withTiming(0.6, { duration: 700 }), -1, true) : withTiming(1)
  }, [isOver, pulse])

  const barStyle = useAnimatedStyle(() => ({ width: `${width.value}%`, opacity: pulse.value }))

  return (
    <View className="h-2 overflow-hidden rounded-full bg-border">
      <Animated.View style={[barStyle, { backgroundColor: barColor(percent) }]} />
    </View>
  )
}
