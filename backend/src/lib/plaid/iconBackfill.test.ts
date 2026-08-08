import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PFC_MAPPING } from './pfc.js'

// drizzle/0008 rewrites the emoji that seeding wrote before the SVG icon set. Nothing at runtime
// reads it, so a slug typo there is invisible until a backfilled user opens the app and sees the
// uncategorized fallback. These assertions pin it to DEFAULT_PFC_MAPPING instead.
const migration = readFileSync(
  fileURLToPath(new URL('../../../drizzle/0008_backfill_category_icon_slugs.sql', import.meta.url)),
  'utf8',
)

/** Every slug the migration can write, from both the name-disambiguated and the VALUES branches. */
function slugsWrittenByMigration(): Set<string> {
  const singles = [...migration.matchAll(/SET "icon" = '([^']+)'/g)].map((m) => m[1])
  const pairs = [...migration.matchAll(/\('[^']+', '([^']+)'\)/g)].map((m) => m[1])
  return new Set([...singles, ...pairs])
}

describe('category icon backfill migration', () => {
  it('writes exactly the slugs the default categories now seed', () => {
    const seeded = new Set(DEFAULT_PFC_MAPPING.map((e) => e.icon))
    expect([...slugsWrittenByMigration()].sort()).toEqual([...seeded].sort())
  })

  it('maps every emoji the previous seed wrote', () => {
    // The pre-SVG seed emoji, transcribed from this file's own history. Bills & Utilities and
    // Loans Received shared the receipt emoji, hence 16 distinct values for 17 categories.
    const seededEmoji = ['🍽', '🚗', '✈️', '🎮', '🛍', '🧾', '⚕️', '💇', '🏠', '🧰', '💰', '⬇️', '⬆️', '🏦', '⚠️', '❔']
    for (const emoji of seededEmoji) {
      expect(migration, `no mapping for ${emoji}`).toContain(`'${emoji}'`)
    }
  })

  it('matches on the icon column so renamed categories still backfill', () => {
    expect(migration).toContain('WHERE "categories"."icon" = v.emoji')
  })
})
