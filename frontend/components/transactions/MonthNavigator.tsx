import { Ionicons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { colors } from '@/constants/theme'
import { monthLabel, type YearMonth } from '@/lib/transactions/filterByMonth'

interface MonthNavigatorProps {
  month: YearMonth
  onPrevious: () => void
  onNext: () => void
}

export function MonthNavigator({ month, onPrevious, onNext }: MonthNavigatorProps) {
  return (
    <View className="flex-row items-center justify-center gap-4">
      <Pressable onPress={onPrevious} accessibilityLabel="Previous month" hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
      </Pressable>
      <Text className="font-sansSemi text-base text-textPrimary">{monthLabel(month)}</Text>
      <Pressable onPress={onNext} accessibilityLabel="Next month" hitSlop={8}>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  )
}
