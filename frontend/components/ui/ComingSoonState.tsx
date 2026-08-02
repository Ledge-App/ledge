import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { Text, View } from 'react-native'
import { colors } from '@/constants/theme'

interface ComingSoonStateProps {
  icon: ComponentProps<typeof Ionicons>['name']
  title: string
  description: string
}

export function ComingSoonState({ icon, title, description }: ComingSoonStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-primaryMuted">
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <View className="items-center gap-1">
        <Text className="font-sansSemi text-lg text-textPrimary">{title}</Text>
        <Text className="text-center font-sans text-base leading-6 text-textSecondary">
          {description}
        </Text>
      </View>
    </View>
  )
}
