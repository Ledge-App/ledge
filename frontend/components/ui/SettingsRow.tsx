import { Ionicons } from '@expo/vector-icons'
import type { ComponentProps } from 'react'
import { Pressable, Text, View } from 'react-native'
import { colors } from '@/constants/theme'

interface SettingsRowProps {
  icon: ComponentProps<typeof Ionicons>['name']
  label: string
  onPress: () => void
  tone?: 'default' | 'danger'
}

export function SettingsRow({ icon, label, onPress, tone = 'default' }: SettingsRowProps) {
  const textColor = tone === 'danger' ? 'text-expense' : 'text-textPrimary'
  const iconColor = tone === 'danger' ? colors.expense : colors.textSecondary

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-md px-4 py-4 active:bg-surfaceRaised"
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text className={`font-sansMed text-base ${textColor}`}>{label}</Text>
      {tone === 'default' ? (
        <View className="ml-auto">
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
      ) : null}
    </Pressable>
  )
}
