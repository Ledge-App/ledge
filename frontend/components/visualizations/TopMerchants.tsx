import { Text, View } from 'react-native'
import { colors } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'
import type { MerchantTotal } from '@/lib/transactions/visualizationData'

interface TopMerchantsProps {
  merchants: MerchantTotal[]
  barColor: string
}

export function TopMerchants({ merchants, barColor }: TopMerchantsProps) {
  if (merchants.length === 0) return null

  const maxAmount = merchants[0].amount

  return (
    <View style={{ gap: 14 }}>
      <Text className="font-sansSemi text-base text-textPrimary">Top Merchants</Text>
      {merchants.map((m, i) => (
        <View key={m.name} style={{ gap: 6 }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1" style={{ marginRight: 12 }}>
              <Text className="font-mono text-xs text-textMuted" style={{ width: 18 }}>{i + 1}</Text>
              <Text className="font-sansMed text-sm text-textPrimary" numberOfLines={1} style={{ flexShrink: 1 }}>
                {m.name}
              </Text>
            </View>
            <Text className="font-mono text-sm text-textPrimary">{formatAmount(m.amount)}</Text>
          </View>
          <View className="rounded-full" style={{ height: 4, backgroundColor: colors.border }}>
            <View
              className="rounded-full"
              style={{ height: 4, width: `${(m.amount / maxAmount) * 100}%`, backgroundColor: barColor, opacity: 1 - i * 0.12 }}
            />
          </View>
        </View>
      ))}
    </View>
  )
}
