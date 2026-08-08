import { Text } from 'react-native'
import { colors } from '@/constants/theme'
import { FALLBACK_ICON_SLUG, isLegacyEmojiIcon, resolveCategoryIcon } from '@/lib/categories/icons'

interface CategoryIconProps {
  /** Slug from `categories.icon`. Null/undefined renders the uncategorized fallback. */
  icon: string | null | undefined
  size: number
  /**
   * Category hex. The SVGs are `currentColor` throughout, so this tints the whole glyph.
   * Defaults to textPrimary rather than react-native-svg's own black default, which no theme
   * color matches.
   */
  color?: string
}

/**
 * Single render path for category icons. Every call site used to inline its own
 * `<Text style={{ fontSize: N }}>{category.icon}</Text>` plus its own '❓' fallback string.
 */
export function CategoryIcon({ icon, size, color = colors.textPrimary }: CategoryIconProps) {
  if (isLegacyEmojiIcon(icon)) {
    // Pre-SVG rows still hold an emoji; render it at the same optical size. Emoji carry their own
    // color, so `color` is deliberately not applied here.
    return <Text style={{ fontSize: size }}>{icon}</Text>
  }

  const Icon = resolveCategoryIcon(icon) ?? resolveCategoryIcon(FALLBACK_ICON_SLUG)
  if (!Icon) return null

  return <Icon width={size} height={size} color={color} />
}
