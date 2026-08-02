import { Text, View } from 'react-native'
import { colors } from '@/constants/theme'

interface AccountRowProps {
  name: string
  balance: number
  variant: 'cash' | 'credit' | 'investment'
  limit?: number | null
}

export function AccountRow({ name, balance, variant, limit }: AccountRowProps) {
  const balanceColor = variant === 'credit' ? colors.expense : colors.textPrimary

  return (
    <View className="flex-row items-center justify-between py-3">
      <View className="flex-row items-center gap-3">
        <View className="h-8 w-8 items-center justify-center rounded-sm bg-surfaceRaised">
          <Text style={{ fontSize: 14 }}>{variant === 'investment' ? '📈' : '🏦'}</Text>
        </View>
        <Text className="font-sansMed text-base text-textPrimary">{name}</Text>
      </View>
      <View className="items-end">
        <Text className="font-mono text-base" style={{ color: balanceColor }}>
          ${balance.toFixed(2)}
        </Text>
        {variant === 'credit' && limit != null ? (
          <Text className="font-sans text-sm text-textMuted">Limit ${limit.toFixed(2)}</Text>
        ) : null}
      </View>
    </View>
  )
}
