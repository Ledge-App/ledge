import { Redirect } from 'expo-router'
import { useOnboardingGate } from '@/hooks/useOnboardingGate'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

const STEP_ROUTES = {
  'needs-credentials': '/onboarding/plaid-setup',
  'needs-link': '/onboarding/link-account',
  'needs-seeding': '/onboarding/seeding',
  ready: '/(tabs)',
} as const

export default function OnboardingIndex() {
  const status = useOnboardingGate()

  if (status === 'loading') return <LoadingScreen />

  return <Redirect href={STEP_ROUTES[status]} />
}
