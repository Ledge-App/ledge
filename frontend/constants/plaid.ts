// Static PFC taxonomy for the Settings → Categories "assign Plaid codes" picker UI only.
// Mobile can't import the backend's lib/plaid/pfc.ts (runtime code stays server-side —
// see architecture.md), so the code list is duplicated here. The backend file remains
// the source of truth for onboarding's default category-seeding mapping.
// Source: Plaid's Personal Finance Category (PFC) taxonomy, personal_finance_category_version: 'v2'.

export interface PfcGroup {
  primary: string
  detailedCodes: string[]
}

export const PFC_TAXONOMY: PfcGroup[] = [
  {
    primary: 'FOOD_AND_DRINK',
    detailedCodes: [
      'FOOD_AND_DRINK_RESTAURANTS',
      'FOOD_AND_DRINK_FAST_FOOD',
      'FOOD_AND_DRINK_GROCERIES',
      'FOOD_AND_DRINK_COFFEE',
      'FOOD_AND_DRINK_ALCOHOL_AND_BARS',
      'FOOD_AND_DRINK_FOOD_DELIVERY_SERVICES',
      'FOOD_AND_DRINK_VENDING_MACHINES',
      'FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK',
    ],
  },
  {
    primary: 'TRANSPORTATION',
    detailedCodes: [
      'TRANSPORTATION_TAXIS_AND_RIDE_SHARES',
      'TRANSPORTATION_GAS',
      'TRANSPORTATION_PUBLIC_TRANSIT',
      'TRANSPORTATION_PARKING',
      'TRANSPORTATION_TOLLS',
      'TRANSPORTATION_BIKES_AND_SCOOTERS',
      'TRANSPORTATION_OTHER_TRANSPORTATION',
    ],
  },
  {
    primary: 'TRAVEL',
    detailedCodes: ['TRAVEL_FLIGHTS', 'TRAVEL_LODGING', 'TRAVEL_RENTAL_CARS', 'TRAVEL_PARKING', 'TRAVEL_OTHER_TRAVEL'],
  },
  {
    primary: 'ENTERTAINMENT',
    detailedCodes: [
      'ENTERTAINMENT_MUSIC_AND_AUDIO',
      'ENTERTAINMENT_TV_AND_MOVIES',
      'ENTERTAINMENT_VIDEO_GAMES',
      'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS',
      'ENTERTAINMENT_OTHER_ENTERTAINMENT',
    ],
  },
  {
    primary: 'GENERAL_MERCHANDISE',
    detailedCodes: [
      'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',
      'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES',
      'GENERAL_MERCHANDISE_ELECTRONICS',
      'GENERAL_MERCHANDISE_SUPERSTORES',
      'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
    ],
  },
  {
    primary: 'RENT_AND_UTILITIES',
    detailedCodes: [
      'RENT_AND_UTILITIES_RENT',
      'RENT_AND_UTILITIES_ELECTRICITY',
      'RENT_AND_UTILITIES_INTERNET_AND_CABLE',
      'RENT_AND_UTILITIES_TELEPHONE',
      'RENT_AND_UTILITIES_WATER',
      'RENT_AND_UTILITIES_OTHER_UTILITIES',
    ],
  },
  {
    primary: 'MEDICAL',
    detailedCodes: ['MEDICAL_DOCTOR_VISITS', 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS', 'MEDICAL_DENTAL', 'MEDICAL_VISION', 'MEDICAL_OTHER_MEDICAL'],
  },
  {
    primary: 'PERSONAL_CARE',
    detailedCodes: ['PERSONAL_CARE_HAIR_AND_BEAUTY', 'PERSONAL_CARE_GYM_AND_FITNESS', 'PERSONAL_CARE_OTHER_PERSONAL_CARE'],
  },
  {
    primary: 'HOME_IMPROVEMENT',
    detailedCodes: ['HOME_IMPROVEMENT_FURNITURE', 'HOME_IMPROVEMENT_HARDWARE', 'HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE', 'HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT'],
  },
  {
    primary: 'GENERAL_SERVICES',
    detailedCodes: ['GENERAL_SERVICES_SUBSCRIPTION', 'GENERAL_SERVICES_INSURANCE', 'GENERAL_SERVICES_FINANCIAL_PLANNING_AND_MANAGEMENT', 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES'],
  },
  {
    primary: 'INCOME',
    detailedCodes: ['INCOME_WAGES', 'INCOME_OTHER_INCOME', 'INCOME_INTEREST_EARNED', 'INCOME_DIVIDENDS'],
  },
  {
    primary: 'TRANSFER_IN',
    detailedCodes: ['TRANSFER_IN_ACCOUNT_TRANSFER', 'TRANSFER_IN_PEER_TO_PEER_PAYMENT', 'TRANSFER_IN_DEPOSIT', 'TRANSFER_IN_OTHER_TRANSFER_IN'],
  },
  {
    primary: 'TRANSFER_OUT',
    detailedCodes: ['TRANSFER_OUT_ACCOUNT_TRANSFER', 'TRANSFER_OUT_PEER_TO_PEER_PAYMENT', 'TRANSFER_OUT_WITHDRAWAL', 'TRANSFER_OUT_OTHER_TRANSFER_OUT'],
  },
  {
    primary: 'LOAN_PAYMENTS',
    detailedCodes: ['LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', 'LOAN_PAYMENTS_MORTGAGE_PAYMENT', 'LOAN_PAYMENTS_OTHER_PAYMENT'],
  },
  {
    primary: 'BANK_FEES',
    detailedCodes: ['BANK_FEES_ATM_FEES', 'BANK_FEES_OVERDRAFT_FEES', 'BANK_FEES_FOREIGN_TRANSACTION_FEES', 'BANK_FEES_OTHER_BANK_FEES'],
  },
  {
    primary: 'GOVERNMENT_AND_NON_PROFIT',
    detailedCodes: ['GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES', 'GOVERNMENT_AND_NON_PROFIT_DONATIONS', 'GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT'],
  },
]

// FOOD_AND_DRINK_FAST_FOOD -> "Fast Food"
export function pfcLabel(detailedCode: string, primary: string): string {
  const withoutPrefix = detailedCode.startsWith(`${primary}_`) ? detailedCode.slice(primary.length + 1) : detailedCode
  return withoutPrefix
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ')
}
