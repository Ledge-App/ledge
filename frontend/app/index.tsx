import { Redirect } from 'expo-router'
import { useSession } from '@/lib/supabase/auth'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

export default function Index() {
  const { session, isLoading } = useSession()

  if (isLoading) return <LoadingScreen />

  return <Redirect href={session ? '/onboarding' : '/(auth)/login'} />
}
