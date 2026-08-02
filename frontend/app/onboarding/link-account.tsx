import { router } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { createPlaidLinkSession } from '@/lib/plaid/createLinkSession'
import { useOnboarding } from '@/hooks/useOnboarding'
import { OnboardingStepHeader } from '@/components/onboarding/OnboardingStepHeader'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

export default function LinkAccountScreen() {
  const { createLinkToken, exchangeToken } = useOnboarding()
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConnect() {
    setError(null)
    setIsConnecting(true)
    try {
      const { linkToken } = await createLinkToken()

      const session = await createPlaidLinkSession({
        token: linkToken,
        onEvent: () => {},
        onExit: (exit) => {
          setIsConnecting(false)
          if (exit.error) {
            setError(exit.error.errorMessage ?? 'Bank connection was cancelled.')
          }
        },
        onSuccess: async (success) => {
          try {
            await exchangeToken({ publicToken: success.publicToken })
            router.replace('/onboarding/seeding')
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not finish linking this account.')
          } finally {
            setIsConnecting(false)
          }
        },
      })

      await session.open()
    } catch (err) {
      setIsConnecting(false)
      setError(err instanceof Error ? err.message : 'Could not open Plaid Link. Try again.')
    }
  }

  return (
    <View className="flex-1 bg-background">
      <OnboardingStepHeader step={2} />
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
