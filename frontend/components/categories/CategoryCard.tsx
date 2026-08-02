import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import { colors, hexToRgba } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const RING_SIZE = 56
const RING_STROKE = 5
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface CategoryCardProps {
  name: string
  icon: string
  color: string
  spent: number
  budget: number | null
  onPress?: () => void
}

function ringColor(percent: number): string {
  if (percent > 90) return colors.expense
  if (percent >= 70) return colors.warning
  return colors.primary
}

export function CategoryCard({ name, icon, color, spent, budget, onPress }: CategoryCardProps) {
  const percent = budget && budget > 0 ? (spent / budget) * 100 : 0
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withTiming(budget ? Math.min(percent, 100) / 100 : 0, { duration: 600, easing: Easing.out(Easing.ease) })
  }, [percent, budget, progress])

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.value) }))

  // cardSurface/iconBg formula per design.md's "Category Card Tints" section — the canonical
  // pastel-fill derivation from the 2026-08 light-mode pivot.
  const cardSurface = hexToRgba(color, 0.16)
  const iconBg = hexToRgba(color, 0.28)
  const stroke = budget ? ringColor(percent) : colors.border

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className="flex-1 gap-3 rounded-lg p-4"
      style={{ backgroundColor: cardSurface }}
    >
      <Text className="font-sansSemi text-sm text-textSecondary">{name}</Text>

      <View className="items-center justify-center" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={colors.border}
            strokeWidth={RING_STROKE}
            fill="none"
            // Dashed outline when no budget is set (design.md Empty States). The two ratios are
            // the dash and gap segment lengths as fractions of the ring circumference (6% dash,
            // 4% gap), which divides the ring into 10 evenly spaced dashes.
            strokeDasharray={budget ? undefined : `${RING_CIRCUMFERENCE * 0.06} ${RING_CIRCUMFERENCE * 0.04}`}
          />
          {budget ? (
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={stroke}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeLinecap="round"
              animatedProps={animatedProps}
            />
          ) : null}
        </Svg>
        <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: iconBg }}>
          <Text style={{ fontSize: 18 }}>{icon}</Text>
        </View>
      </View>

      <View className="gap-0.5">
        <Text className="font-display text-lg text-textPrimary">{formatAmount(spent)}</Text>
        <Text className="font-sans text-xs text-textMuted">{budget ? `of ${formatAmount(budget)} budget` : 'Set budget'}</Text>
      </View>
    </Pressable>
  )
}
