import type { FC } from 'react'
import type { SvgProps } from 'react-native-svg'

import BillsAndUtilities from '@/assets/category-icons/bills-and-utilities.svg'
import Entertainment from '@/assets/category-icons/entertainment.svg'
import Fee from '@/assets/category-icons/fee.svg'
import FoodAndDrink from '@/assets/category-icons/food-and-drink.svg'
import Health from '@/assets/category-icons/health.svg'
import Home from '@/assets/category-icons/home.svg'
import Income from '@/assets/category-icons/income.svg'
import LoanReceived from '@/assets/category-icons/loan-received.svg'
import Other from '@/assets/category-icons/other.svg'
import Payments from '@/assets/category-icons/payments.svg'
import PersonalCare from '@/assets/category-icons/personal-care.svg'
import Services from '@/assets/category-icons/services.svg'
import Shopping from '@/assets/category-icons/shopping.svg'
import TransferIn from '@/assets/category-icons/transfer-in.svg'
import TransferOut from '@/assets/category-icons/transfer-out.svg'
import Transport from '@/assets/category-icons/transport.svg'
import Travel from '@/assets/category-icons/travel.svg'
import Uncategorized from '@/assets/category-icons/uncategorized.svg'

/**
 * Slug -> icon component. Keys are the exact `assets/category-icons/*.svg` filenames and are what
 * `categories.icon` stores; they are NOT derived from the category name, because names are
 * user-editable and renaming a category must not orphan its icon.
 *
 * Keep this in sync with DEFAULT_PFC_MAPPING's `icon` field in backend/src/lib/plaid/pfc.ts —
 * seeding writes those slugs straight into the column, so a slug missing here renders the
 * fallback for every user seeded after the change.
 */
export const CATEGORY_ICONS: Record<string, FC<SvgProps>> = {
  'bills-and-utilities': BillsAndUtilities,
  entertainment: Entertainment,
  fee: Fee,
  'food-and-drink': FoodAndDrink,
  health: Health,
  home: Home,
  income: Income,
  'loan-received': LoanReceived,
  other: Other,
  payments: Payments,
  'personal-care': PersonalCare,
  services: Services,
  shopping: Shopping,
  'transfer-in': TransferIn,
  'transfer-out': TransferOut,
  transport: Transport,
  travel: Travel,
  uncategorized: Uncategorized,
}

/** Rendered when a transaction has no category at all, and when a slug has no matching asset. */
export const FALLBACK_ICON_SLUG = 'uncategorized'

/** Slugs offered by the icon picker, in the order they appear there. */
export const SELECTABLE_ICON_SLUGS: string[] = Object.keys(CATEGORY_ICONS).filter(
  (slug) => slug !== FALLBACK_ICON_SLUG,
)

export function resolveCategoryIcon(slug: string | null | undefined): FC<SvgProps> | null {
  if (!slug) return null
  return CATEGORY_ICONS[slug] ?? null
}

/**
 * Rows seeded before the SVG set stored a literal emoji in `categories.icon`, and the old free-text
 * field let users type anything. Those values have no slug, so they keep rendering as text rather
 * than silently collapsing to the fallback.
 */
export function isLegacyEmojiIcon(icon: string | null | undefined): boolean {
  return !!icon && !(icon in CATEGORY_ICONS)
}
