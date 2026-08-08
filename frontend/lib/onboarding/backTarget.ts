// Onboarding navigates with `router.replace()` at every step, so there is no back stack to
// pop — "back" has to name its destination explicitly. Keeping that mapping here (rather than
// inline in each screen) keeps it testable and keeps the rules in one place.

export type OnboardingStep = 1 | 2 | 3

export const ONBOARDING_ROUTES = {
  1: '/onboarding/plaid-setup',
  2: '/onboarding/link-account',
  3: '/onboarding/seeding',
} as const

export type OnboardingRoute = (typeof ONBOARDING_ROUTES)[OnboardingStep]

interface BackTargetOptions {
  // Step 3 kicks off an unattended seeding sequence. Leaving mid-run would strand it, so back
  // is offered only once the run has failed and the user is already looking at "Try Again".
  seedingFailed?: boolean
}

// Returns the route "back" should go to, or null when the step should not offer back at all.
export function onboardingBackTarget(
  step: OnboardingStep,
  { seedingFailed = false }: BackTargetOptions = {},
): OnboardingRoute | null {
  switch (step) {
    case 1:
      return null
    case 2:
      return ONBOARDING_ROUTES[1]
    case 3:
      return seedingFailed ? ONBOARDING_ROUTES[2] : null
  }
}
