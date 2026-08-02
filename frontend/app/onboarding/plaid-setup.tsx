import { router } from 'expo-router'
import { ScrollView, View } from 'react-native'
import { OnboardingStepHeader } from '@/components/onboarding/OnboardingStepHeader'
import { PlaidCredentialsForm } from '@/components/plaid/PlaidCredentialsForm'

export default function PlaidSetupScreen() {
  return (
    <View className="flex-1 bg-background">
      <OnboardingStepHeader step={1} />
      <ScrollView contentContainerClassName="gap-6 px-5 py-8" keyboardShouldPersistTaps="handled">
        <PlaidCredentialsForm onSaved={() => router.replace('/onboarding/link-account')} />
      </ScrollView>
    </View>
  )
}
