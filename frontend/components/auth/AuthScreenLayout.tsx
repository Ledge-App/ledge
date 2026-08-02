import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native'
import type { ReactNode } from 'react'

interface AuthScreenLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}

// Minimal & fast first-run tone (per design brief): a small wordmark and one line
// of context, then straight into the form — no hero imagery, no marketing copy.
export function AuthScreenLayout({ title, subtitle, children, footer }: AuthScreenLayoutProps) {
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-1 justify-center px-5 py-12"
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-10 gap-2">
          <Text className="font-display text-2xl text-textPrimary">Ledge</Text>
          <View className="gap-1">
            <Text className="font-sansSemi text-xl text-textPrimary">{title}</Text>
            <Text className="font-sans text-base text-textSecondary">{subtitle}</Text>
          </View>
        </View>

        <View className="gap-4">{children}</View>

        <View className="mt-8 flex-row items-center justify-center gap-1">{footer}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
