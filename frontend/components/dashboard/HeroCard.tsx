import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { colors, hexToRgba } from '@/constants/theme'
import { MASKED_AMOUNT, formatAmount as formatMoney } from '@/lib/format/money'

/**
 * Aurora drift: two large, very soft radial glows in a lighter teal, drifting slowly behind
 * the card's content. Ping-pong easing (reverse repeat) keeps the motion organic with no
 * loop seam; each blob follows its own vector and tempo so they never feel synchronized.
 * Reduced motion renders the glows parked — still a nicer card than a flat fill.
 */
const AURORA_TEAL = '#2DD4BF'

function AuroraBlob({
  size,
  baseX,
  baseY,
  driftX,
  driftY,
  duration,
  opacity,
  id,
}: {
  size: number
  baseX: number
  baseY: number
  driftX: number
  driftY: number
  duration: number
  opacity: number
  id: string
}) {
  const progress = useSharedValue(0)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    progress.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, true)
    return () => cancelAnimation(progress)
  }, [reducedMotion, duration, progress])

  const drift = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [0, driftX]) },
      { translateY: interpolate(progress.value, [0, 1], [0, driftY]) },
      { scale: interpolate(progress.value, [0, 1], [1, 1.08]) },
    ],
  }))

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: baseX, top: baseY }, drift]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={AURORA_TEAL} stopOpacity={opacity} />
            <Stop offset="0.7" stopColor={AURORA_TEAL} stopOpacity={opacity * 0.35} />
            <Stop offset="1" stopColor={AURORA_TEAL} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  )
}

// A gently rising trend with believable dips — abstract, but unmistakably "a net worth line".
const SPARK_PATH = 'M0 34 C 28 32, 44 24, 68 26 S 116 15, 148 19 S 204 7, 238 11 S 284 2, 300 5'

/**
 * A sparkline that writes itself across the card (~7s), holds, fades, and starts again —
 * the app's own trend metaphor, riding over the aurora.
 *
 * Implemented as a reveal wipe (the full line inside a clipping container whose width grows)
 * rather than the classic strokeDashoffset trick: under Fabric, Reanimated's animated props
 * don't reach react-native-svg's stroke attributes, so the dash version renders once and
 * never moves. Width and opacity on a plain View animate fine. Reduced motion shows the
 * finished line, still.
 */
function SelfDrawingSparkline({ cardWidth }: { cardWidth: number }) {
  const progress = useSharedValue(0)
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    if (reducedMotion || cardWidth === 0) return
    progress.value = 0
    progress.value = withRepeat(withTiming(1, { duration: 12000, easing: Easing.linear }), -1)
    return () => cancelAnimation(progress)
  }, [reducedMotion, cardWidth, progress])

  const reveal = useAnimatedStyle(() => ({
    // 0 -> 0.55: the line draws. 0.55 -> 0.85: it holds. 0.85 -> 0.97: it fades. Rest: dark.
    width: interpolate(progress.value, [0.04, 0.55], [0, cardWidth], 'clamp'),
    opacity: interpolate(progress.value, [0, 0.04, 0.85, 0.97, 1], [0, 1, 1, 0, 0], 'clamp'),
  }))

  if (cardWidth === 0) return null

  const line = (
    <Svg width={cardWidth} height={40} viewBox="0 0 300 40" preserveAspectRatio="none">
      <Path d={SPARK_PATH} stroke={colors.textInverse} strokeOpacity={0.3} strokeWidth={2} strokeLinecap="round" fill="none" />
    </Svg>
  )

  return (
    <View pointerEvents="none" style={{ position: 'absolute', bottom: 46, left: 0, right: 0, height: 40 }}>
      {reducedMotion ? line : <Animated.View style={[{ overflow: 'hidden', height: 40 }, reveal]}>{line}</Animated.View>}
    </View>
  )
}

function AuroraDrift() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <AuroraBlob id="aurora-a" size={280} baseX={-90} baseY={-110} driftX={44} driftY={26} duration={26000} opacity={0.28} />
      <AuroraBlob id="aurora-b" size={340} baseX={160} baseY={30} driftX={-52} driftY={-30} duration={34000} opacity={0.22} />
    </View>
  )
}

interface HeroCardProps {
  netWorth: number | null
  totalAssets: number | null
  totalLiabilities: number | null
  isLoading: boolean
  isMasked: boolean
  onToggleMask: () => void
  /** Omit to leave the trend icon in its dimmed, non-interactive state. */
  onTrendPress?: () => void
}

function formatAmount(amount: number | null, isMasked: boolean): string {
  if (isMasked) return MASKED_AMOUNT
  if (amount == null) return '—'
  return formatMoney(amount)
}

// Balances here are fetched live through the backend on each view and never persisted
// server-side (architecture.md) — this card carries its own loading skeleton, independent
// of the rest of the Accounts screen. Masking is owned by the screen so the eye toggle
// also hides the per-account balances below the card.
export function HeroCard({ netWorth, totalAssets, totalLiabilities, isLoading, isMasked, onToggleMask, onTrendPress }: HeroCardProps) {
  const [cardWidth, setCardWidth] = useState(0)

  return (
    <View
      className="overflow-hidden rounded-2xl p-5"
      style={{ backgroundColor: colors.primaryDim }}
      onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
    >
      <AuroraDrift />
      <SelfDrawingSparkline cardWidth={cardWidth} />
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={onToggleMask}
          accessibilityLabel={isMasked ? 'Show amounts' : 'Hide amounts'}
          className="flex-row items-center gap-2"
        >
          <Ionicons name={isMasked ? 'eye-off' : 'eye'} size={16} color={hexToRgba(colors.textInverse, 0.6)} />
        </Pressable>
        <Text className="font-sansMed text-sm text-textInverse" style={{ opacity: 0.9 }}>Net Worth</Text>
        <Pressable
          onPress={onTrendPress}
          disabled={onTrendPress == null}
          hitSlop={8}
          accessibilityLabel="Net worth trend"
        >
          <Ionicons name="trending-up" size={18} color={colors.textInverse} style={{ opacity: onTrendPress ? 0.9 : 0.5 }} />
        </Pressable>
      </View>

      <View className="my-5 items-center">
        {isLoading ? (
          <View className="h-10 w-40 rounded-md" style={{ backgroundColor: hexToRgba(colors.textInverse, 0.2) }} />
        ) : (
          <Text className="font-display text-3xl text-textInverse">{formatAmount(netWorth, isMasked)}</Text>
        )}
      </View>


      <View className="flex-row justify-between">
        <View>
          <Text className="font-sans text-xs" style={{ color: hexToRgba(colors.textInverse, 0.6) }}>
            Total Assets
          </Text>
          <Text className="font-sansSemi text-base text-textInverse">{formatAmount(totalAssets, isMasked)}</Text>
        </View>
        <View className="items-end">
          <Text className="font-sans text-xs" style={{ color: hexToRgba(colors.textInverse, 0.6) }}>
            Total Liabilities
          </Text>
          <Text className="font-sansSemi text-base text-textInverse">{formatAmount(totalLiabilities, isMasked)}</Text>
        </View>
      </View>
    </View>
  )
}
