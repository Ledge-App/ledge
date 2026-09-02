/**
 * Merchant Category Code (ISO 18245) → Plaid personal-finance-category.
 *
 * FinanceKit gives transactions an MCC; Plaid gives them a PFC. The app's whole categorization
 * chain (plaid_category_mappings, the settings mapping UI, onboarding seeds) is keyed on PFC, so
 * translating here is what lets Apple Card transactions reuse it untouched — including whatever
 * mappings the user has already customized.
 *
 * Applied at resolve time, never at ingest: the FinanceKit sync is HistoryToken-driven, so a
 * transaction is read exactly once. A PFC baked into the cache would be permanent, and correcting
 * an entry below would mean discarding every token and refetching all history.
 *
 * EXPLICIT covers the codes a consumer card actually sees; RANGES catch the rest of each ISO
 * block so an unlisted code lands in a plausible category rather than Uncategorized. Every code
 * emitted here is asserted against the backend's DEFAULT_PFC_MAPPING in mccToPfc.test.ts — that
 * invariant, not the size of the table, is what keeps this honest as codes are added.
 */

export interface PfcPair {
  pfcPrimary: string | null
  pfcDetailed: string | null
}

const NONE: PfcPair = { pfcPrimary: null, pfcDetailed: null }

/**
 * Every PFC primary. Detailed codes are prefixed by their primary, so the primary is derived by
 * longest-prefix match rather than duplicated in every table row — one place to be wrong instead
 * of hundreds. Longest match matters: TRANSFER_IN_TRANSFER_IN_FROM_APPS must resolve to
 * TRANSFER_IN, and INCOME_* must not be shadowed by a shorter primary.
 */
const PFC_PRIMARIES = [
  'FOOD_AND_DRINK',
  'TRANSPORTATION',
  'TRAVEL',
  'ENTERTAINMENT',
  'GENERAL_MERCHANDISE',
  'RENT_AND_UTILITIES',
  'MEDICAL',
  'PERSONAL_CARE',
  'HOME_IMPROVEMENT',
  'GENERAL_SERVICES',
  'INCOME',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'LOAN_PAYMENTS',
  'LOAN_DISBURSEMENTS',
  'BANK_FEES',
  'GOVERNMENT_AND_NON_PROFIT',
] as const

const EXPLICIT: Record<string, string> = {
  // Food & drink
  '5811': 'FOOD_AND_DRINK_RESTAURANTS',
  '5812': 'FOOD_AND_DRINK_RESTAURANTS',
  '5813': 'FOOD_AND_DRINK_ALCOHOL_AND_BARS',
  '5814': 'FOOD_AND_DRINK_FAST_FOOD',
  '5411': 'FOOD_AND_DRINK_GROCERIES',
  '5422': 'FOOD_AND_DRINK_GROCERIES',
  '5441': 'FOOD_AND_DRINK_GROCERIES',
  '5451': 'FOOD_AND_DRINK_GROCERIES',
  '5462': 'FOOD_AND_DRINK_GROCERIES',
  '5921': 'FOOD_AND_DRINK_ALCOHOL_AND_BARS',
  '5499': 'GENERAL_MERCHANDISE_CONVENIENCE_STORES',

  // Transport
  '4111': 'TRANSPORTATION_PUBLIC_TRANSIT',
  '4112': 'TRANSPORTATION_PUBLIC_TRANSIT',
  '4131': 'TRANSPORTATION_PUBLIC_TRANSIT',
  '4121': 'TRANSPORTATION_TAXIS_AND_RIDE_SHARES',
  '4784': 'TRANSPORTATION_TOLLS',
  '7523': 'TRANSPORTATION_PARKING',
  '5541': 'TRANSPORTATION_GAS',
  '5542': 'TRANSPORTATION_GAS',
  '5983': 'TRANSPORTATION_GAS',

  // Travel
  '4511': 'TRAVEL_FLIGHTS',
  '4411': 'TRAVEL_OTHER_TRAVEL',
  '4722': 'TRAVEL_OTHER_TRAVEL',
  '7011': 'TRAVEL_LODGING',
  '7512': 'TRAVEL_RENTAL_CARS',
  '7513': 'TRAVEL_RENTAL_CARS',
  '7519': 'TRAVEL_RENTAL_CARS',

  // Entertainment
  '5735': 'ENTERTAINMENT_MUSIC_AND_AUDIO',
  '5815': 'ENTERTAINMENT_TV_AND_MOVIES',
  '5816': 'ENTERTAINMENT_VIDEO_GAMES',
  '7832': 'ENTERTAINMENT_TV_AND_MOVIES',
  '7922': 'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS',
  '7929': 'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS',
  '7991': 'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS',
  '7996': 'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS',
  '7994': 'ENTERTAINMENT_VIDEO_GAMES',
  '7995': 'ENTERTAINMENT_CASINOS_AND_GAMBLING',

  // Shopping
  '5300': 'GENERAL_MERCHANDISE_SUPERSTORES',
  '5310': 'GENERAL_MERCHANDISE_DISCOUNT_STORES',
  '5311': 'GENERAL_MERCHANDISE_DEPARTMENT_STORES',
  '5331': 'GENERAL_MERCHANDISE_DISCOUNT_STORES',
  '5651': 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES',
  '5732': 'GENERAL_MERCHANDISE_ELECTRONICS',
  '5734': 'GENERAL_MERCHANDISE_ELECTRONICS',
  '5941': 'GENERAL_MERCHANDISE_SPORTING_GOODS',
  '5942': 'GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS',
  '5994': 'GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS',
  '5945': 'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES',
  '5947': 'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES',
  '5995': 'GENERAL_MERCHANDISE_PET_SUPPLIES',
  '5993': 'GENERAL_MERCHANDISE_TOBACCO_AND_VAPE',
  '5111': 'GENERAL_MERCHANDISE_OFFICE_SUPPLIES',
  '5943': 'GENERAL_MERCHANDISE_OFFICE_SUPPLIES',
  '5964': 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',
  '5965': 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',
  '5969': 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',

  // Bills & utilities
  '4814': 'RENT_AND_UTILITIES_TELEPHONE',
  '4816': 'RENT_AND_UTILITIES_INTERNET_AND_CABLE',
  '4899': 'RENT_AND_UTILITIES_INTERNET_AND_CABLE',
  '4900': 'RENT_AND_UTILITIES_OTHER_UTILITIES',
  '6513': 'RENT_AND_UTILITIES_RENT',

  // Health
  '0742': 'MEDICAL_VETERINARY_SERVICES',
  '5122': 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS',
  '5912': 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS',
  '8011': 'MEDICAL_PRIMARY_CARE',
  '8021': 'MEDICAL_DENTAL_CARE',
  '8043': 'MEDICAL_EYE_CARE',
  '8049': 'MEDICAL_NURSING_CARE',
  '8062': 'MEDICAL_PRIMARY_CARE',

  // Personal care
  '7210': 'PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING',
  '7211': 'PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING',
  '7216': 'PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING',
  '7230': 'PERSONAL_CARE_HAIR_AND_BEAUTY',
  '7297': 'PERSONAL_CARE_OTHER_PERSONAL_CARE',
  '7298': 'PERSONAL_CARE_OTHER_PERSONAL_CARE',
  '7941': 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS',
  '7997': 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS',

  // Home
  '1520': 'HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE',
  '1711': 'HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE',
  '1731': 'HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE',
  '5200': 'HOME_IMPROVEMENT_HARDWARE',
  '5211': 'HOME_IMPROVEMENT_HARDWARE',
  '5251': 'HOME_IMPROVEMENT_HARDWARE',
  '5261': 'HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT',
  '5712': 'HOME_IMPROVEMENT_FURNITURE',
  '5713': 'HOME_IMPROVEMENT_FURNITURE',
  '5719': 'HOME_IMPROVEMENT_FURNITURE',
  '7342': 'HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE',

  // Services
  '4215': 'GENERAL_SERVICES_POSTAGE_AND_SHIPPING',
  '4225': 'GENERAL_SERVICES_STORAGE',
  '6300': 'GENERAL_SERVICES_INSURANCE',
  '7531': 'GENERAL_SERVICES_AUTOMOTIVE',
  '7538': 'GENERAL_SERVICES_AUTOMOTIVE',
  '7542': 'GENERAL_SERVICES_AUTOMOTIVE',
  '8111': 'GENERAL_SERVICES_CONSULTING_AND_LEGAL',
  '8351': 'GENERAL_SERVICES_CHILDCARE',
  '8742': 'GENERAL_SERVICES_CONSULTING_AND_LEGAL',
  '8931': 'GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING',

  // Government & non-profit
  '8398': 'GOVERNMENT_AND_NON_PROFIT_DONATIONS',
  '8661': 'GOVERNMENT_AND_NON_PROFIT_DONATIONS',
  '9211': 'GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES',
  '9222': 'GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES',
  '9311': 'GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT',
  '9399': 'GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES',

  // Cash out. An ATM disbursement is a withdrawal, not a fee.
  '6011': 'TRANSFER_OUT_WITHDRAWAL',
}

/** ISO 18245 blocks, checked only after EXPLICIT misses. Inclusive bounds. */
const RANGES: { from: number; to: number; detailed: string }[] = [
  { from: 3000, to: 3299, detailed: 'TRAVEL_FLIGHTS' },
  { from: 3300, to: 3499, detailed: 'TRAVEL_RENTAL_CARS' },
  { from: 3500, to: 3999, detailed: 'TRAVEL_LODGING' },
  { from: 4000, to: 4799, detailed: 'TRANSPORTATION_OTHER_TRANSPORTATION' },
  { from: 5300, to: 5399, detailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE' },
  { from: 5600, to: 5699, detailed: 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES' },
  { from: 5800, to: 5899, detailed: 'FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK' },
  { from: 7000, to: 7099, detailed: 'TRAVEL_LODGING' },
  { from: 8000, to: 8099, detailed: 'MEDICAL_OTHER_MEDICAL' },
  { from: 8200, to: 8299, detailed: 'GENERAL_SERVICES_EDUCATION' },
  { from: 9200, to: 9399, detailed: 'GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES' },
]

/**
 * Derives the primary from the detailed code's prefix. Sound for every code this table currently
 * emits, but NOT universally: Plaid files TRANSFER_IN_CASH_ADVANCES_AND_LOANS under primary
 * LOAN_DISBURSEMENTS, so prefix-derivation would return TRANSFER_IN for it. If a future MCC needs
 * to map to a code like that, this needs an explicit primary override — the second invariant in
 * mccToPfc.invariant.test.ts fails with the derived and expected primaries side by side, so the
 * failure is self-explaining rather than mysterious.
 */
function primaryOf(detailed: string): string | null {
  let best: string | null = null
  for (const primary of PFC_PRIMARIES) {
    if (detailed.startsWith(`${primary}_`) && (best === null || primary.length > best.length)) {
      best = primary
    }
  }
  return best
}

function pair(detailed: string): PfcPair {
  const pfcPrimary = primaryOf(detailed)
  return pfcPrimary ? { pfcPrimary, pfcDetailed: detailed } : NONE
}

export function mccToPfc(mcc: string | null): PfcPair {
  if (!mcc) return NONE

  const explicit = EXPLICIT[mcc]
  if (explicit) return pair(explicit)

  const numeric = Number(mcc)
  if (!Number.isInteger(numeric)) return NONE

  const range = RANGES.find((r) => numeric >= r.from && numeric <= r.to)
  return range ? pair(range.detailed) : NONE
}

/** Every detailed code this module can emit. Used by the invariant test. */
export const EMITTED_PFC_DETAILED_CODES: string[] = [
  ...new Set([...Object.values(EXPLICIT), ...RANGES.map((r) => r.detailed)]),
]
