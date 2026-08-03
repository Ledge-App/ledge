import { useState } from 'react'
import { Text, TextInput, View, type TextInputProps } from 'react-native'
import { colors, fontFamily, fontSize, borderRadius } from '@/constants/theme'

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
        textContentType="none"
        autoComplete="off"
        placeholderTextColor={colors.textMuted}
        style={{
          height: 52,
          borderRadius: borderRadius.sm,
          borderWidth: 1,
          borderColor,
          backgroundColor: colors.surface,
          paddingHorizontal: 16,
          fontSize: fontSize.base,
          color: colors.textPrimary,
          fontFamily: mono ? fontFamily.mono : fontFamily.sans,
        }}
      />
      {error ? <Text className="font-sans text-sm text-expense">{error}</Text> : null}
    </View>
  )
}
