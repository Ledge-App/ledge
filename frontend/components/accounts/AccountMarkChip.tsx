import { Image, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import type { AccountMark } from '@/hooks/useAccountMarks'

/**
 * The account chip a transaction wears: which card or bank it hit, inside a ring in the amount's
 * own colour — green in, red out, muted for anything the totals leave out.
 *
 * One component for all three places that draw it (the feed row, the detail sheet's header, a
 * link's counterpart), because they drew the same chip three times and an account that looks like
 * one thing in the list and another in the sheet reads as two accounts.
 *
 * An Apple account has no logo to draw, so it gets the Apple mark on the same neutral circle
 * AccountGlyph uses — a bare glyph inside the ring would read as an image that failed to load.
 */
export function AccountMarkChip({ mark, ringColor, size }: { mark: AccountMark | null; ringColor: string; size: number }) {
  if (!mark) return null

  // Proportional to the chip: the 17px feed chip carries a hairline ring, the 56px sheet chip a
  // heavier one, and both stay perfectly round because the radius is derived rather than typed.
  const borderWidth = size >= 40 ? 2 : 1.5
  const padding = size >= 40 ? 3 : 1

  return (
    <View style={{ borderWidth, borderColor: ringColor, borderRadius: size / 2 + padding + borderWidth, padding }}>
      {mark.kind === 'logo' ? (
        <Image
          source={{ uri: `data:image/png;base64,${mark.logo}` }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colors.surfaceRaised,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="logo-apple" size={Math.max(size * 0.62, 8)} color={colors.textPrimary} />
        </View>
      )}
    </View>
  )
}
