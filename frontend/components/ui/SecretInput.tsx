import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { colors, fontFamily, fontSize } from '@/constants/theme'

interface SecretInputProps {
  value: string
  onChangeText: (value: string) => void
  error?: string
  placeholder?: string
}

// Default state: fully masked, monospaced dots. Reveal toggle shows plaintext only
// while focused, and re-masks on blur — see design.md's SecretInput spec.
export function SecretInput({ value, onChangeText, error, placeholder }: SecretInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [isRevealed, setIsRevealed] = useState(false)

  const showPlaintext = isRevealed && isFocused
  const borderColor = error ? colors.expense : isFocused ? colors.primary : colors.border

  return (
    <View className="gap-2">
      <Text className="font-sansMed text-sm text-textSecondary">Secret</Text>
      <View
        style={{ borderColor }}
        className="h-[52px] flex-row items-center rounded-md border bg-surface px-4"
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false)
            setIsRevealed(false)
          }}
          secureTextEntry={!showPlaintext && value.length > 0}
          textContentType="none"
          autoComplete="off"
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            fontFamily: fontFamily.mono,
            fontSize: fontSize.base,
            color: colors.textPrimary,
          }}
        />
        <Pressable
          onPress={() => setIsRevealed((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={showPlaintext ? 'Hide secret' : 'Show secret'}
          hitSlop={8}
        >
          <Ionicons
            name={showPlaintext ? 'eye-off' : 'eye'}
            size={20}
            color={colors.textMuted}
          />
        </Pressable>
      </View>
      {error ? <Text className="font-sans text-sm text-expense">{error}</Text> : null}
    </View>
  )
}

// Shown once a credential has been saved: the real secret is never pre-filled.
export function SavedSecretPlaceholder({ onReplace }: { onReplace: () => void }) {
  return (
    <View className="gap-2">
      <Text className="font-sansMed text-sm text-textSecondary">Secret</Text>
      <View className="h-[52px] flex-row items-center justify-between rounded-md border border-border bg-surface px-4">
        <Text className="font-mono text-base text-textMuted">••••••••••••••••••••••••••••</Text>
        <Pressable onPress={onReplace} hitSlop={8}>
          <Text className="font-sansMed text-sm text-primary">Replace</Text>
        </Pressable>
      </View>
    </View>
  )
}
