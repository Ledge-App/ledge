import { router } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { signInWithApple, signInWithGoogle } from '@/lib/supabase/auth'
import { AppleSignInButton } from '@/components/auth/AppleSignInButton'
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Reveal } from '@/components/ui/Reveal'

// The only auth screen: Google sign-in doubles as signup, so there is no form, no second
// screen, and nothing to cross-link to. Composition is a masthead — wordmark, full-bleed
// ledger rule, one line of copy — held at the top third, with the single action anchored
// at the thumb rather than floated in the middle of the screen.
export default function LoginScreen() {
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // One shared runner: both providers resolve to a Supabase session (or null on cancel),
  // and only one attempt can be in flight at a time.
  async function handleSignIn(signIn: () => ReturnType<typeof signInWithGoogle>) {
    setError(null)
    setIsSubmitting(true)
    try {
      const session = await signIn()
      if (session) router.replace('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <View className="flex-1 bg-background px-5">
      {/* Two equal halves put the button's own centre on the screen's centre line. The
          masthead is bottom-aligned in the upper half so it hangs just above it, and the
          error banner lives up here too — surfacing one must not shove the button off centre. */}
      <View className="flex-1 justify-end pb-12">
        <Reveal>
          <Text className="font-display text-3xl leading-[56px] text-textPrimary">
            ToFi<Text className="text-primary">.</Text>
          </Text>
        </Reveal>

        {/* Full-bleed so the rule runs edge to edge like a ruled ledger line, rather than
            sitting inside the screen's 20px gutter as one more boxed-in element. */}
        <Reveal delay={70}>
          <View className="-mx-5 mt-6 h-px bg-border" />
        </Reveal>

        <Reveal delay={140}>
          <Text className="mt-6 font-sans text-md text-textSecondary">Every account, one number.</Text>
        </Reveal>

        {error ? (
          <View className="mt-8">
            <ErrorBanner message={error} onDismiss={() => setError(null)} />
          </View>
        ) : null}
      </View>

      {/* Apple first: guideline 4.8 wants Sign in with Apple at least as prominent as any
          third-party login, and review reads order as prominence. */}
      <Reveal delay={220}>
        <AppleSignInButton onPress={() => handleSignIn(signInWithApple)} loading={isSubmitting} />
      </Reveal>

      <Reveal delay={280}>
        <View className="mt-3">
          <GoogleSignInButton onPress={() => handleSignIn(signInWithGoogle)} loading={isSubmitting} />
        </View>
      </Reveal>

      <View className="flex-1" />
    </View>
  )
}
