import { Link, router } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'
import { signIn } from '@/lib/supabase/auth'
import { AuthScreenLayout } from '@/components/auth/AuthScreenLayout'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleLogin() {
    setError(null)
    setIsSubmitting(true)
    try {
      await signIn(email.trim(), password)
      router.replace('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log in. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0

  return (
    <AuthScreenLayout
      title="Welcome back"
      subtitle="Log in to pick up where you left off."
      footer={
        <>
          <Text className="font-sans text-base text-textSecondary">New here?</Text>
          <Link href="/(auth)/signup" replace>
            <Text className="font-sansMed text-base text-primary">Create an account</Text>
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
        placeholder="••••••••"
      />

      <Button label="Log In" onPress={handleLogin} disabled={!canSubmit} loading={isSubmitting} />
    </AuthScreenLayout>
  )
}
