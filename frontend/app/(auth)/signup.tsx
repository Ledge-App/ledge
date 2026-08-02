import { Link, router } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'
import { signUp } from '@/lib/supabase/auth'
import { AuthScreenLayout } from '@/components/auth/AuthScreenLayout'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

const MIN_PASSWORD_LENGTH = 8

export default function SignupScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSignup() {
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setIsSubmitting(true)
    try {
      await signUp(email.trim(), password)
      router.replace('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create your account. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0

  return (
    <AuthScreenLayout
      title="Create your account"
      subtitle="Ledge is invite-only for now — glad you're here."
      footer={
        <>
          <Text className="font-sans text-base text-textSecondary">Already have an account?</Text>
          <Link href="/(auth)/login" replace>
            <Text className="font-sansMed text-base text-primary">Log in</Text>
          </Link>
        </>
      }
    >
      {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="you@example.com"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        placeholder="At least 8 characters"
      />

      <Button label="Create Account" onPress={handleSignup} disabled={!canSubmit} loading={isSubmitting} />
    </AuthScreenLayout>
  )
}
