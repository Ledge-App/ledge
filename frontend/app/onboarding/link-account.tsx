import { router } from 'expo-router'
import { Text, View } from 'react-native'
import { onboardingBackTarget } from '@/lib/onboarding/backTarget'
import { useLinkSession } from '@/hooks/useLinkSession'
import { OnboardingStepHeader } from '@/components/onboarding/OnboardingStepHeader'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

export default function LinkAccountScreen() {
  const backTarget = onboardingBackTarget(2)
  // Create mode is correct here and only here: onboarding is by definition a first connection,
  // so there is no existing Item to update.
  const { openCreateLink, isConnecting, error, setError } = useLinkSession()

  function handleConnect() {
    void openCreateLink({ onCompleted: () => router.replace('/onboarding/seeding') })
  }

  return (
    <View className="flex-1 bg-background">
      <OnboardingStepHeader
        step={2}
        onBack={backTarget ? () => router.replace(backTarget) : undefined}
      />
      <View className="flex-1 justify-center gap-6 px-5">
        <View className="gap-2">
          <Text className="font-sansSemi text-xl text-textPrimary">Link your first account</Text>
          <Text className="font-sans text-base leading-6 text-textSecondary">
            Connect a checking, savings, credit card, or investment account through Plaid. Your
            credentials go straight to your bank — Ledge never sees them.
          </Text>
        </View>

        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

        <Button label="Connect a bank account" onPress={handleConnect} loading={isConnecting} />
      </View>
    </View>
  )
}
