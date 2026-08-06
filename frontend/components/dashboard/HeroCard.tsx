import { Ionicons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors, hexToRgba } from '@/constants/theme'
import { MASKED_AMOUNT, formatAmount as formatMoney } from '@/lib/format/money'

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
  return (
    <View className="overflow-hidden rounded-2xl p-5" style={{ backgroundColor: colors.primaryDim }}>
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

      <Svg width="100%" height={30} viewBox="0 0 300 30" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 48, left: 0, right: 0, opacity: 0.3 }}>
        <Path d="M0 15 Q 50 0 100 15 T 200 15 T 300 15 V 30 H 0 Z" fill={colors.textInverse} />
      </Svg>
      <Svg width="100%" height={24} viewBox="0 0 300 24" preserveAspectRatio="none" style={{ position: 'absolute', bottom: 44, left: 0, right: 0, opacity: 0.15 }}>
        <Path d="M0 8 Q 75 24 150 8 T 300 8 V 24 H 0 Z" fill={colors.textInverse} />
      </Svg>

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
