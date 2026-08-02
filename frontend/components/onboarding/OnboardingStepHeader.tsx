import { View } from 'react-native'

const STEP_COUNT = 3

interface OnboardingStepHeaderProps {
  step: 1 | 2 | 3
}

// A quiet progress indicator, not a hero element — keeps the "minimal & fast" tone
// (per design brief) while still orienting the user within the mandatory sequence.
export function OnboardingStepHeader({ step }: OnboardingStepHeaderProps) {
  return (
    <View className="flex-row gap-2 px-5 pt-4">
      {Array.from({ length: STEP_COUNT }, (_, index) => index + 1).map((dot) => (
        <View
          key={dot}
          className={`h-1 flex-1 rounded-full ${dot <= step ? 'bg-primary' : 'bg-border'}`}
        />
      ))}
    </View>
  )
}
