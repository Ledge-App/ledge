import { useState } from 'react'
import { Text, TextInput, View, type TextInputProps } from 'react-native'
import { colors } from '@/constants/theme'

interface TextFieldProps extends TextInputProps {
  label: string
  error?: string
  mono?: boolean
}

export function TextField({ label, error, mono, ...inputProps }: TextFieldProps) {
  const [isFocused, setIsFocused] = useState(false)

  const borderColor = error ? colors.expense : isFocused ? colors.primary : colors.border

  return (
    <View className="gap-2">
      <Text className="font-sansMed text-sm text-textSecondary">{label}</Text>
      <TextInput
        {...inputProps}
        onFocus={(event) => {
          setIsFocused(true)
          inputProps.onFocus?.(event)
        }}
        onBlur={(event) => {
          setIsFocused(false)
          inputProps.onBlur?.(event)
        }}
        placeholderTextColor={colors.textMuted}
        style={{ borderColor }}
        className={`h-[52px] rounded-md border bg-surface px-4 text-base text-textPrimary ${
          mono ? 'font-mono' : 'font-sans'
        }`}
      />
      {error ? <Text className="font-sans text-sm text-expense">{error}</Text> : null}
    </View>
  )
}
