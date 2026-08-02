import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors, hexToRgba } from '@/constants/theme'

interface HeroCardProps {
  netWorth: number | null
  totalAssets: number | null
  totalLiabilities: number | null
  isLoading: boolean
}

function formatAmount(amount: number | null, isMasked: boolean): string {
  if (isMasked) return '$****'
  if (amount == null) return '—'
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Balances here are fetched live through the backend on each view and never persisted
// server-side (architecture.md) — this card carries its own loading skeleton, independent
// of the rest of the Accounts screen.
export function HeroCard({ netWorth, totalAssets, totalLiabilities, isLoading }: HeroCardProps) {
  const [isMasked, setIsMasked] = useState(false)

  return (
    <View className="overflow-hidden rounded-xl p-5" style={{ backgroundColor: colors.primaryDim }}>
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => setIsMasked((m) => !m)}
          accessibilityLabel={isMasked ? 'Show amounts' : 'Hide amounts'}
          className="flex-row items-center gap-2"
        >
          <Ionicons name={isMasked ? 'eye-off' : 'eye'} size={18} color={colors.textInverse} />
          <Text className="font-sansMed text-sm text-textInverse">Net Worth</Text>
        </Pressable>
        <Ionicons name="trending-up" size={18} color={colors.textInverse} style={{ opacity: 0.5 }} />
      </View>

      <View className="mb-6 mt-4">
        {isLoading ? (
          <View className="h-9 w-40 rounded-md" style={{ backgroundColor: hexToRgba(colors.textInverse, 0.2) }} />
        ) : (
          <Text className="font-display text-3xl text-textInverse">{formatAmount(netWorth, isMasked)}</Text>
        )}
      </View>

      <Svg width="100%" height={24} viewBox="0 0 300 24" style={{ position: 'absolute', bottom: 56, opacity: 0.5 }}>
        <Path d="M0 12 Q 37.5 0 75 12 T 150 12 T 225 12 T 300 12 V 24 H 0 Z" fill={colors.primaryMuted} />
      </Svg>

      <View className="flex-row justify-between">
        <View>
          <Text className="font-sans text-xs" style={{ color: hexToRgba(colors.textInverse, 0.7) }}>
            Total Assets
          </Text>
          <Text className="font-sansSemi text-base text-textInverse">{formatAmount(totalAssets, isMasked)}</Text>
        </View>
        <View>
          <Text className="font-sans text-xs" style={{ color: hexToRgba(colors.textInverse, 0.7) }}>
            Total Liabilities
          </Text>
          <Text className="font-sansSemi text-base text-textInverse">{formatAmount(totalLiabilities, isMasked)}</Text>
        </View>
      </View>
    </View>
  )
}
