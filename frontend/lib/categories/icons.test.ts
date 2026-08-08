import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_ICONS,
  FALLBACK_ICON_SLUG,
  SELECTABLE_ICON_SLUGS,
  isLegacyEmojiIcon,
  resolveCategoryIcon,
} from './icons'

const assetDir = fileURLToPath(new URL('../../assets/category-icons', import.meta.url))
const assetSlugs = readdirSync(assetDir)
  .filter((f) => f.endsWith('.svg'))
  .map((f) => f.replace(/\.svg$/, ''))

describe('CATEGORY_ICONS', () => {
  // The registry's import list is hand-maintained, so a dropped-in SVG is easy to forget. Both
  // directions matter: an unregistered file is a dead asset, a registered-but-missing file is a
  // metro resolution error at startup.
  it('has exactly one entry per SVG in assets/category-icons', () => {
    expect(Object.keys(CATEGORY_ICONS).sort()).toEqual([...assetSlugs].sort())
  })

  it('includes the fallback slug', () => {
    expect(CATEGORY_ICONS[FALLBACK_ICON_SLUG]).toBeDefined()
  })

  it('excludes the fallback from the picker, since it means "no category"', () => {
    expect(SELECTABLE_ICON_SLUGS).not.toContain(FALLBACK_ICON_SLUG)
    expect(SELECTABLE_ICON_SLUGS).toHaveLength(assetSlugs.length - 1)
  })
})

describe('resolveCategoryIcon', () => {
  it('resolves a known slug', () => {
    expect(resolveCategoryIcon('food-and-drink')).toBe(CATEGORY_ICONS['food-and-drink'])
  })

  it('returns null for an unknown slug or no icon, leaving the fallback to the caller', () => {
    expect(resolveCategoryIcon('not-a-slug')).toBeNull()
    expect(resolveCategoryIcon(null)).toBeNull()
    expect(resolveCategoryIcon('')).toBeNull()
  })
})

describe('isLegacyEmojiIcon', () => {
  it('treats pre-SVG emoji values as legacy so they keep rendering as text', () => {
    expect(isLegacyEmojiIcon('🍽')).toBe(true)
  })

  it('does not treat a registered slug as legacy', () => {
    expect(isLegacyEmojiIcon('food-and-drink')).toBe(false)
  })

  it('does not treat a missing icon as legacy', () => {
    expect(isLegacyEmojiIcon(null)).toBe(false)
    expect(isLegacyEmojiIcon('')).toBe(false)
  })
})
