import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors, shadow } from '@/constants/theme'

// Google's branding guidelines require the unmodified four-color mark on a light,
// neutral button — hence the raw hexes here rather than tokens from constants/theme.
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </Svg>
  )
}

interface GoogleSignInButtonProps {
  onPress: () => void
  loading?: boolean
}

// White surface lifted with a soft shadow rather than a heavy border — the light-mode
// elevation treatment from design.md. Google's guidelines want the mark on a light neutral
// button, which the design system's own `surface` token happens to already be.
export function GoogleSignInButton({ onPress, loading }: GoogleSignInButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled: !!loading, busy: !!loading }}
      style={shadow.sm}
      className={`h-14 flex-row items-center justify-center gap-3 rounded-md border border-border bg-surface px-5 active:opacity-90 ${
        loading ? 'opacity-60' : ''
      }`}
    >
      {/* The mark's slot keeps its width while loading, so the label never shifts and the
          button doesn't visibly collapse to a bare spinner mid-tap. */}
      <View className="h-[18px] w-[18px] items-center justify-center">
        {loading ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <GoogleMark />}
      </View>
      <Text className="font-sansSemi text-md text-textPrimary">Continue with Google</Text>
    </Pressable>
  )
}
