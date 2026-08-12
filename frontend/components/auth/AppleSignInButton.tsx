import { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as AppleAuthentication from 'expo-apple-authentication'
import { shadow } from '@/constants/theme'

interface AppleSignInButtonProps {
  onPress: () => void
  loading?: boolean
}

/**
 * Custom rather than Apple's ASAuthorizationAppleIDButton: the system button scales its
 * label with the button's height, so at the 56pt this screen uses it shouts next to the
 * Google button's text-md. Apple's HIG allows a custom button provided it keeps the Apple
 * logo, approved wording ("Continue with Apple"), and solid black/white styling — all of
 * which this mirrors from GoogleSignInButton so the two read as one system.
 *
 * Renders nothing where the capability doesn't exist (Android, web, a binary built without
 * the native module), so callers can lay it out unconditionally.
 */
export function AppleSignInButton({ onPress, loading }: AppleSignInButtonProps) {
  const [isAvailable, setIsAvailable] = useState(false)

  useEffect(() => {
    if (Platform.OS !== 'ios') return
    AppleAuthentication.isAvailableAsync()
      .then(setIsAvailable)
      .catch(() => setIsAvailable(false))
  }, [])

  if (!isAvailable) return null

  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel="Continue with Apple"
      accessibilityState={{ disabled: !!loading, busy: !!loading }}
      style={shadow.sm}
      className={`h-14 flex-row items-center justify-center gap-3 rounded-md bg-black px-5 active:opacity-90 ${
        loading ? 'opacity-60' : ''
      }`}
    >
      {/* Same fixed logo slot as the Google button: the spinner swaps in without the label shifting. */}
      <View className="h-[20px] w-[20px] items-center justify-center">
        {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="logo-apple" size={20} color="#FFFFFF" />}
      </View>
      <Text className="font-sansSemi text-md text-white">Continue with Apple</Text>
    </Pressable>
  )
}
