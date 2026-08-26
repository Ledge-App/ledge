import { router } from 'expo-router'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { OnboardingStepHeader } from '@/components/onboarding/OnboardingStepHeader'
import { PlaidCredentialsForm } from '@/components/plaid/PlaidCredentialsForm'

export default function PlaidSetupScreen() {
  return (
    <View className="flex-1 bg-background">
      <OnboardingStepHeader step={1} />
      {/* The Client ID and Secret fields sit low on the screen, so without this the keyboard
          covers whichever one is focused. No offset is needed: the onboarding layout hides the
          native header, so this view already starts at the top of the safe area. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerClassName="gap-6 px-5 py-8"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <PlaidCredentialsForm onSaved={() => router.replace('/onboarding/link-account')} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
