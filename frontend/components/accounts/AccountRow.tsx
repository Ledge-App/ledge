import { Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'

interface AccountRowProps {
  name: string
  balance: number
  variant: 'cash' | 'credit' | 'investment'
  limit?: number | null
  isMasked?: boolean
  onPress?: () => void
}

const variantIcons: Record<string, { name: string; color: string }> = {
  cash: { name: 'wallet', color: '#3B82F6' },
  investment: { name: 'trending-up', color: '#E11D48' },
  credit: { name: 'card', color: '#6B7280' },
}

export function AccountRow({ name, balance, variant, limit, isMasked, onPress }: AccountRowProps) {
  const balanceColor = variant === 'credit' ? colors.expense : colors.textPrimary
  const icon = variantIcons[variant] ?? variantIcons.cash

  return (
    <Pressable onPress={onPress} className="flex-row items-center justify-between py-3.5">
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-surfaceRaised">
          <Ionicons name={icon.name as any} size={18} color={icon.color} />
        </View>
        <Text className="font-sansMed text-base text-textPrimary">{name}</Text>
      </View>
      <View className="items-end">
        <Text className="font-mono text-base" style={{ color: balanceColor }}>
          {isMasked ? '$****' : formatAmount(balance)}
        </Text>
        {variant === 'credit' && limit != null ? (
          <Text className="font-sans text-xs text-textMuted">Limit {isMasked ? '$****' : formatAmount(limit)}</Text>
        ) : null}
      </View>
    </Pressable>
  )
}
