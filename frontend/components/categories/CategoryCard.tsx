import { Pressable, Text, View } from 'react-native'
import { hexToRgba } from '@/constants/theme'
import { formatAmount } from '@/lib/format/money'

interface CategoryCardProps {
  name: string
  icon: string
  color: string
  spent: number
  budget: number | null
  onPress?: () => void
}

export function CategoryCard({ name, icon, color, spent, onPress }: CategoryCardProps) {
  const cardSurface = hexToRgba(color, 0.16)
  const iconBg = hexToRgba(color, 0.28)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className="items-center gap-2 rounded-xl py-4 px-2"
      style={{ backgroundColor: cardSurface }}
    >
      <Text className="font-sansSemi text-sm text-textSecondary">{name}</Text>

      <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: iconBg }}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
      </View>

      <Text className="font-display text-md text-textPrimary">{formatAmount(spent)}</Text>
    </Pressable>
  )
}
