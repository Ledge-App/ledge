import { Ionicons } from '@expo/vector-icons'
import { Alert, Pressable, Text, View } from 'react-native'
import { colors } from '@/constants/theme'
import { signOut } from '@/lib/supabase/auth'
import { onboardingBackTarget, type OnboardingStep } from '@/lib/onboarding/backTarget'

const STEP_COUNT = 3

interface OnboardingStepHeaderProps {
  step: OnboardingStep
  // Only passed by steps that have somewhere to go back to — see `onboardingBackTarget`.
  onBack?: () => void
}

function confirmSignOut() {
  Alert.alert('Sign out?', 'Your progress is saved — you can pick up where you left off.', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Sign Out',
      style: 'destructive',
      onPress: async () => {
        try {
          await signOut()
          // No navigation here: the onboarding layout redirects to login once the session clears.
        } catch (err) {
          Alert.alert(
            'Could not sign out',
            err instanceof Error ? err.message : 'Something went wrong. Try again.',
          )
        }
      },
    },
  ])
}

// A quiet progress indicator, not a hero element — keeps the "minimal & fast" tone
// (per design brief) while still orienting the user within the mandatory sequence.
// The row above it is the only escape hatch from the flow: the layout disables the native
// header and swipe-back, so back and sign-out have to live here.
export function OnboardingStepHeader({ step, onBack }: OnboardingStepHeaderProps) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between px-5 pt-3">
        {onBack ? (
          <Pressable onPress={onBack} accessibilityLabel="Go back" hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
          </Pressable>
        ) : (
          <View />
        )}
        <Pressable onPress={confirmSignOut} accessibilityLabel="Sign out" hitSlop={8}>
          <Text className="font-sansMed text-sm text-textSecondary">Sign Out</Text>
        </Pressable>
      </View>

      <View className="flex-row gap-2 px-5">
        {Array.from({ length: STEP_COUNT }, (_, index) => index + 1).map((dot) => (
          <View
            key={dot}
            className={`h-1 flex-1 rounded-full ${dot <= step ? 'bg-primary' : 'bg-border'}`}
          />
        ))}
      </View>
    </View>
  )
}
