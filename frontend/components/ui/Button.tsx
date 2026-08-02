import { ActivityIndicator, Pressable, Text } from 'react-native'
import { colors } from '@/constants/theme'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  disabled?: boolean
  loading?: boolean
}

export function Button({ label, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const isDisabled = disabled || loading

  const containerClass = {
    primary: 'bg-primary',
    secondary: 'bg-transparent border border-border',
    ghost: 'bg-transparent',
  }[variant]

  const textClass = {
    primary: 'text-textInverse',
    secondary: 'text-textPrimary',
    ghost: 'text-primary',
  }[variant]

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      className={`h-[52px] flex-row items-center justify-center rounded-lg px-5 active:opacity-80 ${containerClass} ${
        isDisabled ? 'opacity-40' : ''
      }`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.textInverse : colors.primary} />
      ) : (
        <Text className={`font-sansSemi text-base ${textClass}`}>{label}</Text>
      )}
    </Pressable>
  )
}
