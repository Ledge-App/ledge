import { Ionicons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { colors } from '@/constants/theme'

interface ErrorBannerProps {
  message: string
  onDismiss?: () => void
}

// Inline error banner: rose background, dismiss button — not a modal (design.md).
export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <View className="flex-row items-start gap-3 rounded-md bg-expense/10 px-4 py-3">
      <Text className="font-sans text-base text-expense">{message}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} accessibilityLabel="Dismiss error" hitSlop={8} className="ml-auto">
          <Ionicons name="close" size={18} color={colors.expense} />
        </Pressable>
      ) : null}
    </View>
  )
}
