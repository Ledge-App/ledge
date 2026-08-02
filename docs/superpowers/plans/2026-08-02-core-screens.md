# Core Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every remaining screen in Ledge's navigation tree (Dashboard, Transactions with list+calendar+3 sheets, Budgets, Accounts, Settings→Categories) on top of the merged frontend foundation, so the app is functionally complete end to end.

**Architecture:** Screens compose existing hooks (`useTransactionFeed`, `useAccounts`, `useBudgets`, `useCategories`, `useSubcategories`, `useReimbursements`, `useVendorMappings`, `useTransactionOverrides`, `useManualTransactions`) and existing shared components (`CategoryCard`, `TransactionRow`, `HeroCard`, `AccountRow`, `BudgetCard`/`BudgetProgressBar`, `CalendarCell`, `CategoryPicker`, `BottomSheet`). Month filtering is per-screen local state over a new pure `filterByMonth` function — no new backend calls, no shared month context. Two new small CRUD hooks (`usePlaidCategoryMappings`, `usePlaidLink`) fill the one gap the foundation left (category-PFC mapping management, generic Plaid Link outside onboarding).

**Tech Stack:** React Native (Expo, expo-router), NativeWind, `@trpc/react-query`, `react-native-plaid-link-sdk` (already integrated for onboarding).

## Global Constraints

- Strict layering: Components → Hooks → API client. No component imports a hook's internals or the API client directly except through props/hooks.
- Design tokens only — every color/spacing/radius from `constants/theme.ts` / NativeWind classes derived from it. Exception (per prior ruling in the foundation phase): icon glyph font-size and fixed icon-badge/chip dimensions are component-intrinsic geometry and may be literal px — but colors are NEVER literal, even in icon badges.
- No `<form>` tags — controlled inputs only.
- Category deletion in this pass ships the confirmation UI only; actual bulk-reassignment of `vendorMappings`/`transactionOverrides` to a new category is NOT implemented (no backend endpoint for it) — the reassignment picker option is present but disabled with a "Coming soon" label; only the plain "leave uncategorized" delete path is wired.
- Month selection is independent per screen (Dashboard/Transactions/Budgets each hold their own `selectedMonth` local state) — no shared/global month context.
- No global privacy/masking context — `HeroCard`'s own toggle and any new per-section masking stays component-local.
- Amounts always render via `frontend/lib/format/money.ts`'s `formatAmount` (already exists from the foundation phase) — never ad hoc `.toFixed(2)`/`.toLocaleString()`.
- Routing: Accounts lives at `app/(tabs)/settings/accounts.tsx` (per product.md's nav tree), not as a top-level tab.

---

## Task 1: `constants/plaid.ts` — PFC taxonomy for the picker UI

**Files:**
- Create: `frontend/constants/plaid.ts`

**Interfaces:**
- Produces: `PFC_TAXONOMY: { ledgeCategory: string; primary: string; detailedCodes: string[] }[]` and `pfcLabel(code: string): string` — consumed by `PlaidPfcPicker` (Task 7).

Mobile can't import backend runtime code (only types, per architecture.md), so the PFC taxonomy used purely for rendering the "assign PFC codes to a category" picker is duplicated here as static reference data (matches `architecture.md`'s file structure, which already lists `constants/plaid.ts` as a planned file). This is reference data, not business logic — the backend's `lib/plaid/pfc.ts` remains the source of truth for onboarding seeding defaults; this file only needs the code list + grouping for the picker UI, not colors/icons/subcategory defaults.

- [ ] **Step 1: Create `frontend/constants/plaid.ts`**

```ts
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
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/constants/plaid.ts
git commit -m "feat: add PFC taxonomy reference data for the category picker UI"
```

---

## Task 2: `lib/transactions/filterByMonth.ts`

**Files:**
- Create: `frontend/lib/transactions/filterByMonth.ts`
- Test: `frontend/lib/transactions/filterByMonth.test.ts`

**Interfaces:**
- Consumes: `FeedItem` from `@/lib/transactions/resolveFeed`.
- Produces: `filterByMonth(feed: FeedItem[], month: { year: number; month: number }): FeedItem[]`, `monthLabel(month: { year: number; month: number }): string` (e.g. "June 2026"), `shiftMonth(month, delta: 1 | -1): { year, month }`, `currentMonth(): { year: number; month: number }` — consumed by every screen with a `MonthNavigator` (Tasks 12, 13, 14).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { currentMonth, filterByMonth, monthLabel, shiftMonth } from './filterByMonth'
import type { FeedItem } from './resolveFeed'

function item(date: string): FeedItem {
  return {
    id: date, source: 'plaid', amount: 10, date, merchantName: 'x', categoryId: null, subcategoryId: null,
    categorySource: 'uncategorized', confidenceLevel: null, accountId: null, pending: false, note: null,
    reimbursedAmount: null, netAmount: null, isReimbursementIncome: false, reimbursementCategoryId: null,
  }
}

describe('filterByMonth', () => {
  it('keeps only items whose date falls within the given year/month', () => {
    const feed = [item('2026-06-30'), item('2026-06-01'), item('2026-07-01'), item('2025-06-15')]
    const result = filterByMonth(feed, { year: 2026, month: 6 })
    expect(result.map((i) => i.date)).toEqual(['2026-06-30', '2026-06-01'])
  })

  it('returns an empty array when nothing matches', () => {
    expect(filterByMonth([item('2026-01-01')], { year: 2026, month: 6 })).toEqual([])
  })
})

describe('shiftMonth', () => {
  it('moves forward a month, rolling over into the next year at December', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 6 }, 1)).toEqual({ year: 2026, month: 7 })
  })

  it('moves backward a month, rolling under into the previous year at January', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth({ year: 2026, month: 6 }, -1)).toEqual({ year: 2026, month: 5 })
  })
})

describe('monthLabel', () => {
  it('formats as "Month YYYY"', () => {
    expect(monthLabel({ year: 2026, month: 6 })).toBe('June 2026')
    expect(monthLabel({ year: 2026, month: 12 })).toBe('December 2026')
  })
})

describe('currentMonth', () => {
  it('returns a {year, month} matching today', () => {
    const now = new Date()
    expect(currentMonth()).toEqual({ year: now.getFullYear(), month: now.getMonth() + 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/transactions/filterByMonth.test.ts`
Expected: FAIL with "Cannot find module './filterByMonth'"

- [ ] **Step 3: Implement**

```ts
import type { FeedItem } from './resolveFeed'

export interface YearMonth {
  year: number
  month: number // 1-12
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function monthPrefix({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function filterByMonth(feed: FeedItem[], month: YearMonth): FeedItem[] {
  const prefix = monthPrefix(month)
  return feed.filter((item) => item.date.startsWith(prefix))
}

export function shiftMonth({ year, month }: YearMonth, delta: 1 | -1): YearMonth {
  const zeroBased = month - 1 + delta
  const newYear = year + Math.floor(zeroBased / 12)
  const newMonth = ((zeroBased % 12) + 12) % 12
  return { year: newYear, month: newMonth + 1 }
}

export function monthLabel({ year, month }: YearMonth): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function currentMonth(): YearMonth {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/transactions/filterByMonth.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/transactions/filterByMonth.ts frontend/lib/transactions/filterByMonth.test.ts
git commit -m "feat: add month filtering/navigation pure functions"
```

---

## Task 3: `lib/categories/pfcOwnership.ts`

**Files:**
- Create: `frontend/lib/categories/pfcOwnership.ts`
- Test: `frontend/lib/categories/pfcOwnership.test.ts`

**Interfaces:**
- Consumes: `Category`, `PlaidCategoryMapping` types (the latter needs adding to `@/types/domain` — see Step 0 below).
- Produces: `resolvePfcOwnership(mappings, categories): Map<string, { categoryId: string; categoryName: string }>` (keyed by detailed PFC code) — consumed by `PlaidPfcPicker` (Task 7).

- [ ] **Step 0: Add the missing `PlaidCategoryMapping` type to `frontend/types/domain.ts`**

Open `frontend/types/domain.ts` and add one line (the router already exists on the backend, this just wasn't needed until now):

```ts
export type PlaidCategoryMapping = RouterOutputs['plaidCategoryMappings']['list'][number]
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { resolvePfcOwnership } from './pfcOwnership'
import type { Category, PlaidCategoryMapping } from '@/types/domain'

const categories: Category[] = [
  { id: 'cat-food', name: 'Food & Drink', color: '#F97316', icon: '🍽' },
  { id: 'cat-transport', name: 'Transport', color: '#3B82F6', icon: '🚗' },
]

const mappings: PlaidCategoryMapping[] = [
  { id: 'm1', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: 'cat-food' },
  { id: 'm2', plaidPfcPrimary: 'TRANSPORTATION', plaidPfcDetailed: 'TRANSPORTATION_GAS', categoryId: 'cat-transport' },
]

describe('resolvePfcOwnership', () => {
  it('maps each claimed detailed PFC code to its owning category id and name', () => {
    const result = resolvePfcOwnership(mappings, categories)
    expect(result.get('FOOD_AND_DRINK_COFFEE')).toEqual({ categoryId: 'cat-food', categoryName: 'Food & Drink' })
    expect(result.get('TRANSPORTATION_GAS')).toEqual({ categoryId: 'cat-transport', categoryName: 'Transport' })
  })

  it('has no entry for an unclaimed code', () => {
    const result = resolvePfcOwnership(mappings, categories)
    expect(result.has('FOOD_AND_DRINK_GROCERIES')).toBe(false)
  })

  it('ignores a mapping whose category no longer exists', () => {
    const orphaned: PlaidCategoryMapping[] = [
      { id: 'm3', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_BARS', categoryId: 'cat-deleted' },
    ]
    const result = resolvePfcOwnership(orphaned, categories)
    expect(result.has('FOOD_AND_DRINK_BARS')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/categories/pfcOwnership.test.ts`
Expected: FAIL with "Cannot find module './pfcOwnership'"

- [ ] **Step 3: Implement**

```ts
import type { Category, PlaidCategoryMapping } from '@/types/domain'

export interface PfcOwner {
  categoryId: string
  categoryName: string
}

// Only mappings with a detailed (not primary-only) code are relevant to the per-code
// picker UI — primary-only fallback mappings aren't individually selectable there.
export function resolvePfcOwnership(mappings: PlaidCategoryMapping[], categories: Category[]): Map<string, PfcOwner> {
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const owners = new Map<string, PfcOwner>()

  for (const mapping of mappings) {
    if (!mapping.plaidPfcDetailed) continue
    const category = categoryById.get(mapping.categoryId)
    if (!category) continue
    owners.set(mapping.plaidPfcDetailed, { categoryId: category.id, categoryName: category.name })
  }

  return owners
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/categories/pfcOwnership.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/types/domain.ts frontend/lib/categories/pfcOwnership.ts frontend/lib/categories/pfcOwnership.test.ts
git commit -m "feat: add PFC code ownership resolution for the category picker"
```

---

## Task 4: `usePlaidCategoryMappings` and `usePlaidLink` hooks

**Files:**
- Create: `frontend/hooks/usePlaidCategoryMappings.ts`
- Create: `frontend/hooks/usePlaidLink.ts`

**Interfaces:**
- Produces: `usePlaidCategoryMappings()` returning `{ data, isLoading, error, create, update, delete }` (same pattern as every other foundation hook); `usePlaidLink()` returning `{ createLinkToken, exchangeToken }` — consumed by `CategoryForm` (Task 8) and the Accounts screen (Task 16).

No tests, matching the existing untested-thin-hook convention.

- [ ] **Step 1: Create `frontend/hooks/usePlaidCategoryMappings.ts`**

```ts
import { api } from '@/lib/api/client'

export function usePlaidCategoryMappings() {
  const utils = api.useUtils()
  const mappings = api.plaidCategoryMappings.list.useQuery()
  const createMutation = api.plaidCategoryMappings.create.useMutation({
    onSuccess: () => utils.plaidCategoryMappings.list.invalidate(),
  })
  const updateMutation = api.plaidCategoryMappings.update.useMutation({
    onSuccess: () => utils.plaidCategoryMappings.list.invalidate(),
  })
  const deleteMutation = api.plaidCategoryMappings.delete.useMutation({
    onSuccess: () => utils.plaidCategoryMappings.list.invalidate(),
  })

  return {
    data: mappings.data,
    isLoading: mappings.isLoading,
    error: mappings.error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
```

- [ ] **Step 2: Create `frontend/hooks/usePlaidLink.ts`**

```ts
import { api } from '@/lib/api/client'

// Generic Plaid Link token creation/exchange, usable outside the onboarding flow
// (see hooks/useOnboarding.ts for the onboarding-specific bundle this overlaps with).
export function usePlaidLink() {
  const createLinkToken = api.plaidLink.createLinkToken.useMutation()
  const exchangeToken = api.plaidLink.exchangeToken.useMutation()

  return {
    createLinkToken: createLinkToken.mutateAsync,
    exchangeToken: exchangeToken.mutateAsync,
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/hooks/usePlaidCategoryMappings.ts frontend/hooks/usePlaidLink.ts
git commit -m "feat: add usePlaidCategoryMappings and usePlaidLink hooks"
```

---

## Task 5: `MonthNavigator` component

**Files:**
- Create: `frontend/components/transactions/MonthNavigator.tsx`

**Interfaces:**
- Consumes: `YearMonth`, `monthLabel` from `@/lib/transactions/filterByMonth`.
- Produces: `<MonthNavigator month onPrevious onNext />` — used by Dashboard (Task 12), Transactions (Task 13), Budgets (Task 15).

- [ ] **Step 1: Create `frontend/components/transactions/MonthNavigator.tsx`**

```tsx
import { Ionicons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { colors } from '@/constants/theme'
import { monthLabel, type YearMonth } from '@/lib/transactions/filterByMonth'

interface MonthNavigatorProps {
  month: YearMonth
  onPrevious: () => void
  onNext: () => void
}

export function MonthNavigator({ month, onPrevious, onNext }: MonthNavigatorProps) {
  return (
    <View className="flex-row items-center justify-center gap-4">
      <Pressable onPress={onPrevious} accessibilityLabel="Previous month" hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color={colors.textSecondary} />
      </Pressable>
      <Text className="font-sansSemi text-base text-textPrimary">{monthLabel(month)}</Text>
      <Pressable onPress={onNext} accessibilityLabel="Next month" hitSlop={8}>
        <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/transactions/MonthNavigator.tsx
git commit -m "feat: add MonthNavigator"
```

---

## Task 6: `AccountsFilterDropdown` component

**Files:**
- Create: `frontend/components/ui/AccountsFilterDropdown.tsx`

**Interfaces:**
- Consumes: `Account` from `@/types/domain`.
- Produces: `<AccountsFilterDropdown accounts selectedAccountId onSelect />` (`selectedAccountId: string | null`, `null` = "All Accounts") — used by Dashboard (Task 12), Transactions (Task 13).

A lightweight dropdown: tapping opens a small menu (reuses `BottomSheet` for the options list, since there's no separate dropdown primitive in this codebase) listing "All Accounts" plus each linked account.

- [ ] **Step 1: Create `frontend/components/ui/AccountsFilterDropdown.tsx`**

```tsx
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Pressable, Text } from 'react-native'
import { colors } from '@/constants/theme'
import { BottomSheet } from './BottomSheet'
import type { Account } from '@/types/domain'

interface AccountsFilterDropdownProps {
  accounts: Account[]
  selectedAccountId: string | null
  onSelect: (accountId: string | null) => void
}

export function AccountsFilterDropdown({ accounts, selectedAccountId, onSelect }: AccountsFilterDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedName = selectedAccountId
    ? accounts.find((a) => a.account_id === selectedAccountId)?.name ?? 'All Accounts'
    : 'All Accounts'

  return (
    <>
      <Pressable onPress={() => setIsOpen(true)} className="flex-row items-center gap-1">
        <Text className="font-sansSemi text-base text-textPrimary">{selectedName}</Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
      </Pressable>

      <BottomSheet visible={isOpen} onClose={() => setIsOpen(false)}>
        <Pressable
          onPress={() => {
            onSelect(null)
            setIsOpen(false)
          }}
          className="flex-row items-center justify-between py-3"
        >
          <Text className="font-sansMed text-base text-textPrimary">All Accounts</Text>
          {selectedAccountId === null ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
        </Pressable>
        {accounts.map((account) => (
          <Pressable
            key={account.account_id}
            onPress={() => {
              onSelect(account.account_id)
              setIsOpen(false)
            }}
            className="flex-row items-center justify-between py-3"
          >
            <Text className="font-sansMed text-base text-textPrimary">{account.name}</Text>
            {selectedAccountId === account.account_id ? (
              <Ionicons name="checkmark" size={18} color={colors.primary} />
            ) : null}
          </Pressable>
        ))}
      </BottomSheet>
    </>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ui/AccountsFilterDropdown.tsx
git commit -m "feat: add AccountsFilterDropdown"
```

---

## Task 7: `PlaidPfcPicker` component

**Files:**
- Create: `frontend/components/categories/PlaidPfcPicker.tsx`

**Interfaces:**
- Consumes: `PFC_TAXONOMY`, `pfcLabel` from `@/constants/plaid` (Task 1); `resolvePfcOwnership` from `@/lib/categories/pfcOwnership` (Task 3).
- Produces: `<PlaidPfcPicker mappings categories currentCategoryId selectedCodes onChange />` — `selectedCodes: Set<string>` (detailed codes currently checked for the category being created/edited), `onChange: (codes: Set<string>) => void`, `currentCategoryId: string | null` (null when creating — used so a code already owned by the SAME category being edited shows as checked/enabled, not disabled-owned-by-self) — used by `CategoryForm` (Task 8).

- [ ] **Step 1: Create `frontend/components/categories/PlaidPfcPicker.tsx`**

```tsx
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import { PFC_TAXONOMY, pfcLabel } from '@/constants/plaid'
import { resolvePfcOwnership } from '@/lib/categories/pfcOwnership'
import type { Category, PlaidCategoryMapping } from '@/types/domain'

interface PlaidPfcPickerProps {
  mappings: PlaidCategoryMapping[]
  categories: Category[]
  currentCategoryId: string | null
  selectedCodes: Set<string>
  onChange: (codes: Set<string>) => void
}

export function PlaidPfcPicker({ mappings, categories, currentCategoryId, selectedCodes, onChange }: PlaidPfcPickerProps) {
  const [expandedPrimary, setExpandedPrimary] = useState<string | null>(null)
  const ownership = resolvePfcOwnership(mappings, categories)

  function toggleCode(code: string) {
    const next = new Set(selectedCodes)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    onChange(next)
  }

  return (
    <View className="gap-2">
      {PFC_TAXONOMY.map((group) => {
        const isExpanded = expandedPrimary === group.primary
        return (
          <View key={group.primary} className="rounded-md bg-surface">
            <Pressable
              onPress={() => setExpandedPrimary(isExpanded ? null : group.primary)}
              className="flex-row items-center justify-between px-4 py-3"
            >
              <Text className="font-sansSemi text-base text-textPrimary">{pfcLabel(group.primary, '')}</Text>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
            </Pressable>

            {isExpanded ? (
              <View className="gap-1 px-4 pb-3">
                {group.detailedCodes.map((code) => {
                  const owner = ownership.get(code)
                  const isOwnedByOther = owner != null && owner.categoryId !== currentCategoryId
                  const isChecked = selectedCodes.has(code)

                  return (
                    <Pressable
                      key={code}
                      onPress={() => !isOwnedByOther && toggleCode(code)}
                      disabled={isOwnedByOther}
                      className="flex-row items-center gap-3 py-2"
                    >
                      <Ionicons
                        name={isChecked ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={isOwnedByOther ? colors.textMuted : isChecked ? colors.primary : colors.textSecondary}
                      />
                      <Text
                        className={`font-sans text-base ${isOwnedByOther ? 'text-textMuted' : 'text-textPrimary'}`}
                      >
                        {pfcLabel(code, group.primary)}
                      </Text>
                      {isOwnedByOther ? (
                        <Text className="ml-auto font-sans text-xs text-textMuted">{owner.categoryName}</Text>
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}
```

Note: `pfcLabel(group.primary, '')` for the group header just title-cases the primary code itself (empty prefix means nothing is stripped) — this reuses the same helper rather than adding a second formatting function.

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/categories/PlaidPfcPicker.tsx
git commit -m "feat: add PlaidPfcPicker"
```

---

## Task 8: `CategoryForm` component

**Files:**
- Create: `frontend/components/categories/CategoryForm.tsx`

**Interfaces:**
- Consumes: `PlaidPfcPicker` (Task 7), `TextField`, `Button` (existing), `categoryColors` from `@/constants/theme`.
- Produces: `<CategoryForm category? mappings categories onSave onDelete? isSaving />` — `category?: Category` (undefined = create mode), `onSave: (input: { name: string; color: string; icon: string; selectedCodes: Set<string> }) => void` — used by the category create/edit screen (Task 18).

- [ ] **Step 1: Create `frontend/components/categories/CategoryForm.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { categoryColors } from '@/constants/theme'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { PlaidPfcPicker } from './PlaidPfcPicker'
import type { Category, PlaidCategoryMapping } from '@/types/domain'

interface CategoryFormProps {
  category?: Category
  mappings: PlaidCategoryMapping[]
  categories: Category[]
  isSaving: boolean
  onSave: (input: { name: string; color: string; icon: string; selectedCodes: Set<string> }) => void
  onDelete?: () => void
}

export function CategoryForm({ category, mappings, categories, isSaving, onSave, onDelete }: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? Object.values(categoryColors)[0])
  const [icon, setIcon] = useState(category?.icon ?? '')

  const initialSelectedCodes = useMemo(() => {
    if (!category) return new Set<string>()
    return new Set(
      mappings.filter((m) => m.categoryId === category.id && m.plaidPfcDetailed).map((m) => m.plaidPfcDetailed as string),
    )
  }, [category, mappings])

  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(initialSelectedCodes)

  const canSave = name.trim().length > 0 && icon.trim().length > 0 && selectedCodes.size > 0

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 px-5 py-6">
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Groceries" />
      <TextField label="Icon (emoji)" value={icon} onChangeText={setIcon} placeholder="🛒" maxLength={4} />

      <View className="gap-2">
        <Text className="font-sansMed text-sm text-textSecondary">Color</Text>
        <View className="flex-row flex-wrap gap-3">
          {Object.values(categoryColors).map((swatch) => (
            <Pressable
              key={swatch}
              onPress={() => setColor(swatch)}
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: swatch, borderWidth: color === swatch ? 2 : 0, borderColor: '#00000030' }}
            />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Text className="font-sansMed text-sm text-textSecondary">
          Plaid categories for this category (required)
        </Text>
        <PlaidPfcPicker
          mappings={mappings}
          categories={categories}
          currentCategoryId={category?.id ?? null}
          selectedCodes={selectedCodes}
          onChange={setSelectedCodes}
        />
      </View>

      <Button
        label={category ? 'Save Changes' : 'Create Category'}
        onPress={() => onSave({ name: name.trim(), color, icon: icon.trim(), selectedCodes })}
        disabled={!canSave}
        loading={isSaving}
      />

      {onDelete ? <Button label="Delete Category" variant="ghost" onPress={onDelete} /> : null}
    </ScrollView>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/categories/CategoryForm.tsx
git commit -m "feat: add CategoryForm"
```

---

## Task 9: `CategorySheet` component

**Files:**
- Create: `frontend/components/transactions/CategorySheet.tsx`

**Interfaces:**
- Consumes: `BottomSheet`, `CategoryPicker` (existing); `FeedItem` (existing); `useCategories`, `useSubcategories`, `useTransactionOverrides`, `useVendorMappings` (existing, called by the parent screen and passed in, NOT called inside this component — see layering note below).
- Produces: `<CategorySheet visible item categories onClose onSave onOpenReimbursement />` where `onSave: (input: { categoryId: string; subcategoryId: string | null; applyToVendor: boolean }) => void` and `onOpenReimbursement: () => void` (called instead of `onSave` when the reimbursement toggle is on) — used by Transactions (Task 13) and Dashboard's recent-transactions tap (Task 12).

Per the architecture's layering rule (Components take props only, hooks live in the parent), `CategorySheet` does NOT call `useSubcategories`/`useTransactionOverrides`/`useVendorMappings` itself — the parent screen owns those hooks and passes `categories`/`subcategories` as props and `onSave` as a callback that performs the actual mutation calls. This keeps `CategorySheet` reusable and testable in isolation.

- [ ] **Step 1: Create `frontend/components/transactions/CategorySheet.tsx`**

```tsx
import { useState } from 'react'
import { Switch, Text, View } from 'react-native'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { CategoryPicker } from '@/components/categories/CategoryPicker'
import { Button } from '@/components/ui/Button'
import { formatAmount } from '@/lib/format/money'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Category, Subcategory } from '@/types/domain'

interface CategorySheetProps {
  visible: boolean
  item: FeedItem | null
  categories: Category[]
  subcategories: Subcategory[]
  onClose: () => void
  onSave: (input: { categoryId: string; subcategoryId: string | null; applyToVendor: boolean }) => void
  onOpenReimbursement: (input: { categoryId: string; subcategoryId: string | null }) => void
}

export function CategorySheet({ visible, item, categories, subcategories, onClose, onSave, onOpenReimbursement }: CategorySheetProps) {
  const [categoryId, setCategoryId] = useState<string | null>(item?.categoryId ?? null)
  const [subcategoryId, setSubcategoryId] = useState<string | null>(item?.subcategoryId ?? null)
  const [applyToVendor, setApplyToVendor] = useState(true)
  const [markReimbursed, setMarkReimbursed] = useState(false)

  if (!item) return null

  const availableSubcategories = subcategories.filter((s) => s.categoryId === categoryId)

  function handleSave() {
    if (!categoryId) return
    if (markReimbursed) {
      onOpenReimbursement({ categoryId, subcategoryId })
    } else {
      onSave({ categoryId, subcategoryId, applyToVendor })
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="font-sansSemi text-lg text-textPrimary">{item.merchantName}</Text>
      <Text className="mb-4 font-sans text-sm text-textSecondary">
        {item.date} · {formatAmount(item.amount)}
      </Text>

      <Text className="mb-2 font-sansMed text-sm text-textSecondary">Category</Text>
      <CategoryPicker categories={categories} selectedCategoryId={categoryId} onSelect={(id) => {
        setCategoryId(id)
        setSubcategoryId(null)
      }} />

      {availableSubcategories.length > 0 ? (
        <View className="mt-4 flex-row flex-wrap gap-2">
          {availableSubcategories.map((sub) => (
            <Text
              key={sub.id}
              onPress={() => setSubcategoryId(sub.id)}
              className={`rounded-full border px-3 py-2 font-sansMed text-sm ${
                subcategoryId === sub.id ? 'border-primary bg-primaryMuted text-primary' : 'border-border text-textSecondary'
              }`}
            >
              {sub.name}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="mt-4 flex-row items-center justify-between py-3">
        <Text className="font-sans text-base text-textPrimary">Apply to all future {item.merchantName}?</Text>
        <Switch value={applyToVendor} onValueChange={setApplyToVendor} />
      </View>

      <View className="flex-row items-center justify-between py-3">
        <Text className="font-sans text-base text-textPrimary">Mark as Reimbursement</Text>
        <Switch value={markReimbursed} onValueChange={setMarkReimbursed} />
      </View>

      <Button label="Save Changes" onPress={handleSave} disabled={!categoryId} />
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/transactions/CategorySheet.tsx
git commit -m "feat: add CategorySheet"
```

---

## Task 10: `ReimbursementSheet` component

**Files:**
- Create: `frontend/components/reimbursements/ReimbursementSheet.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (existing); `FeedItem` (existing); `applyReimbursements`-equivalent live math (reimplemented inline here as a simple running total, not imported, since this is presentational preview math over a local `linked` list, not the full feed-wide function).
- Produces: `<ReimbursementSheet visible expenseItem candidateIncomeItems onClose onSave />` where `onSave: (linkedIncomeIds: string[]) => void` — used by Transactions (Task 13) and Dashboard (Task 12, if reimbursement flow is triggered from recent transactions).

- [ ] **Step 1: Create `frontend/components/reimbursements/ReimbursementSheet.tsx`**

```tsx
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '@/constants/theme'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { Button } from '@/components/ui/Button'
import { formatAmount } from '@/lib/format/money'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

interface ReimbursementSheetProps {
  visible: boolean
  expenseItem: FeedItem | null
  candidateIncomeItems: FeedItem[]
  onClose: () => void
  onSave: (linkedIncomeIds: string[]) => void
}

export function ReimbursementSheet({ visible, expenseItem, candidateIncomeItems, onClose, onSave }: ReimbursementSheetProps) {
  const [linkedIds, setLinkedIds] = useState<string[]>([])

  if (!expenseItem) return null

  const linkedItems = candidateIncomeItems.filter((c) => linkedIds.includes(c.id))
  const linkedTotal = linkedItems.reduce((sum, c) => sum + Math.abs(c.amount), 0)
  const netExpense = Math.max(0, expenseItem.amount - linkedTotal)
  const unlinkedCandidates = candidateIncomeItems.filter((c) => !linkedIds.includes(c.id))

  function toggleLink(id: string) {
    setLinkedIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]))
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="font-sansSemi text-lg text-textPrimary">Reimbursement for</Text>
      <Text className="mb-4 font-mono text-base text-expense">
        {expenseItem.merchantName} {formatAmount(expenseItem.amount)}
      </Text>

      <Text className="mb-2 font-sansMed text-sm text-textSecondary">Link incoming payment(s)</Text>
      {unlinkedCandidates.map((candidate) => (
        <View key={candidate.id} className="flex-row items-center justify-between py-2">
          <View className="flex-row items-center gap-2">
            <Ionicons name="arrow-undo" size={16} color={colors.reimbursed} />
            <Text className="font-sans text-base text-textPrimary">{candidate.merchantName}</Text>
            <Text className="font-mono text-sm text-income">{formatAmount(candidate.amount)}</Text>
          </View>
          <Pressable onPress={() => toggleLink(candidate.id)}>
            <Text className="font-sansMed text-sm text-primary">Link</Text>
          </Pressable>
        </View>
      ))}

      {linkedItems.length > 0 ? (
        <View className="mt-4 gap-2">
          <Text className="font-sansMed text-sm text-textSecondary">Linked:</Text>
          {linkedItems.map((linked) => (
            <View key={linked.id} className="flex-row items-center justify-between py-1">
              <Text className="font-sans text-base text-textPrimary">
                ✓ {linked.merchantName} {formatAmount(linked.amount)}
              </Text>
              <Pressable onPress={() => toggleLink(linked.id)} hitSlop={8}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Text className="my-4 font-sans text-base text-textPrimary">
        Net expense: {formatAmount(expenseItem.amount)} − {formatAmount(linkedTotal)} ={' '}
        <Text className="font-mono text-expense">{formatAmount(netExpense)}</Text>
      </Text>

      <Button label="Save Reimbursement" onPress={() => onSave(linkedIds)} disabled={linkedIds.length === 0} />
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend/components/reimbursements/ReimbursementSheet.tsx
git commit -m "feat: add ReimbursementSheet"
```

---

## Task 11: `ManualTransactionSheet` component

**Files:**
- Create: `frontend/components/transactions/ManualTransactionSheet.tsx`

**Interfaces:**
- Consumes: `BottomSheet`, `SegmentedControl`, `CategoryPicker`, `TextField`, `Button` (existing).
- Produces: `<ManualTransactionSheet visible transaction? categories subcategories onClose onSave onDelete? isSaving />` — `transaction?: ManualTransaction` (undefined = create mode), `onSave: (input: { amount: string; type: 'expense'|'income'; categoryId: string|null; subcategoryId: string|null; date: string; note: string|null }) => void` — used by Transactions (Task 13).

- [ ] **Step 1: Create `frontend/components/transactions/ManualTransactionSheet.tsx`**

```tsx
import { useState } from 'react'
import { Platform, Text, TextInput, View } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { CategoryPicker } from '@/components/categories/CategoryPicker'
import { TextField } from '@/components/ui/TextField'
import { Button } from '@/components/ui/Button'
import { colors } from '@/constants/theme'
import type { Category, ManualTransaction, Subcategory } from '@/types/domain'

interface ManualTransactionSheetProps {
  visible: boolean
  transaction?: ManualTransaction
  categories: Category[]
  subcategories: Subcategory[]
  isSaving: boolean
  onClose: () => void
  onSave: (input: { amount: string; type: 'expense' | 'income'; categoryId: string | null; subcategoryId: string | null; date: string; note: string | null }) => void
  onDelete?: () => void
}

export function ManualTransactionSheet({ visible, transaction, categories, subcategories, isSaving, onClose, onSave, onDelete }: ManualTransactionSheetProps) {
  const [type, setType] = useState<'expense' | 'income'>(transaction?.type ?? 'expense')
  const [amountText, setAmountText] = useState(transaction?.amount ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.categoryId ?? null)
  const [subcategoryId, setSubcategoryId] = useState<string | null>(transaction?.subcategoryId ?? null)
  const [date, setDate] = useState(transaction?.date ?? new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState(transaction?.note ?? '')

  const availableSubcategories = subcategories.filter((s) => s.categoryId === categoryId)
  const isValidAmount = /^\d+(\.\d{1,2})?$/.test(amountText) && Number(amountText) > 0

  function handleSave() {
    onSave({
      amount: amountText,
      type,
      categoryId,
      subcategoryId,
      date,
      note: note.trim().length > 0 ? note.trim() : null,
    })
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text className="mb-4 font-sansSemi text-lg text-textPrimary">
        {transaction ? 'Edit Transaction' : 'Add Transaction'}
      </Text>

      <SegmentedControl
        options={[{ label: 'Expense', value: 'expense' as const }, { label: 'Income', value: 'income' as const }]}
        value={type}
        onChange={setType}
      />

      <View className="my-4 items-center">
        <Text className="font-sansMed text-sm text-textSecondary">Amount</Text>
        <TextInput
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          className={`font-display text-3xl ${type === 'expense' ? 'text-expense' : 'text-income'}`}
        />
      </View>

      <Text className="mb-2 font-sansMed text-sm text-textSecondary">Category</Text>
      <CategoryPicker
        categories={categories}
        selectedCategoryId={categoryId}
        onSelect={(id) => {
          setCategoryId(id)
          setSubcategoryId(null)
        }}
      />

      {availableSubcategories.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-2">
          {availableSubcategories.map((sub) => (
            <Text
              key={sub.id}
              onPress={() => setSubcategoryId(sub.id)}
              className={`rounded-full border px-3 py-2 font-sansMed text-sm ${
                subcategoryId === sub.id ? 'border-primary bg-primaryMuted text-primary' : 'border-border text-textSecondary'
              }`}
            >
              {sub.name}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="my-4">
        <Text className="mb-2 font-sansMed text-sm text-textSecondary">Date</Text>
        <DateTimePicker
          value={new Date(date)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_, selected) => selected && setDate(selected.toISOString().slice(0, 10))}
        />
      </View>

      <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Street food, cash" />

      <View className="mt-4 gap-2">
        <Button label="Save Transaction" onPress={handleSave} disabled={!isValidAmount} loading={isSaving} />
        {onDelete ? <Button label="Delete Transaction" variant="ghost" onPress={onDelete} /> : null}
      </View>
    </BottomSheet>
  )
}
```

Note: this introduces `@react-native-community/datetimepicker` as a new dependency (not yet in `frontend/package.json`). Add it as part of Step 1 (`npm install @react-native-community/datetimepicker` inside `frontend/`) before writing the component — Expo's SDK 57 has a compatible version; let `npx expo install @react-native-community/datetimepicker` pick the right one if plain `npm install` warns about a peer mismatch.

- [ ] **Step 2: Install the date picker dependency**

Run: `cd frontend && npx expo install @react-native-community/datetimepicker`

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add frontend/components/transactions/ManualTransactionSheet.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: add ManualTransactionSheet"
```

---

## Task 12: Dashboard screen

**Files:**
- Modify: `frontend/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `useTransactionFeed`, `useAccounts`, `useBudgets`, `useCategories`, `useSubcategories`, `useTransactionOverrides`, `useVendorMappings`, `useReimbursements` (existing); `CategoryCard`, `TransactionRow`, `BudgetCard`, `MonthNavigator`, `AccountsFilterDropdown`, `CategorySheet`, `ReimbursementSheet` (existing/prior tasks); `filterByMonth`, `currentMonth`, `shiftMonth` (Task 2).

- [ ] **Step 1: Replace `frontend/app/(tabs)/index.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { useAccounts } from '@/hooks/useAccounts'
import { useBudgets } from '@/hooks/useBudgets'
import { useCategories } from '@/hooks/useCategories'
import { useSubcategories } from '@/hooks/useSubcategories'
import { useTransactionOverrides } from '@/hooks/useTransactionOverrides'
import { useVendorMappings } from '@/hooks/useVendorMappings'
import { useReimbursements } from '@/hooks/useReimbursements'
import { CategoryCard } from '@/components/categories/CategoryCard'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { BudgetCard } from '@/components/budgets/BudgetCard'
import { MonthNavigator } from '@/components/transactions/MonthNavigator'
import { AccountsFilterDropdown } from '@/components/ui/AccountsFilterDropdown'
import { CategorySheet } from '@/components/transactions/CategorySheet'
import { ReimbursementSheet } from '@/components/reimbursements/ReimbursementSheet'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { formatAmount } from '@/lib/format/money'
import { currentMonth, filterByMonth, shiftMonth } from '@/lib/transactions/filterByMonth'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

export default function DashboardScreen() {
  const [month, setMonth] = useState(currentMonth())
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [expensesOpen, setExpensesOpen] = useState(true)
  const [incomeOpen, setIncomeOpen] = useState(true)
  const [activeSheetItem, setActiveSheetItem] = useState<FeedItem | null>(null)
  const [reimbursementItem, setReimbursementItem] = useState<FeedItem | null>(null)
  const [pendingReimbursementMeta, setPendingReimbursementMeta] = useState<{ categoryId: string; subcategoryId: string | null } | null>(null)

  const { feed, categoryById, isLoading, error } = useTransactionFeed()
  const accounts = useAccounts()
  const budgets = useBudgets()
  const categories = useCategories()
  const subcategories = useSubcategories()
  const overrides = useTransactionOverrides()
  const vendorMappings = useVendorMappings()
  const reimbursements = useReimbursements()

  const accountFilteredFeed = useMemo(
    () => (selectedAccountId ? feed.filter((item) => item.accountId === selectedAccountId) : feed),
    [feed, selectedAccountId],
  )
  const monthFeed = useMemo(() => filterByMonth(accountFilteredFeed, month), [accountFilteredFeed, month])

  const spendByCategory = useMemo(() => {
    const totals = new Map<string, number>()
    for (const item of monthFeed) {
      if (item.amount <= 0 || !item.categoryId || item.isReimbursementIncome) continue
      const net = item.netAmount ?? item.amount
      totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + net)
    }
    return totals
  }, [monthFeed])

  const totalExpenses = Array.from(spendByCategory.values()).reduce((sum, v) => sum + v, 0)

  const incomeTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const item of monthFeed) {
      if (item.amount >= 0 || !item.categoryId) continue
      totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + Math.abs(item.amount))
    }
    return totals
  }, [monthFeed])
  const totalIncome = Array.from(incomeTotals.values()).reduce((sum, v) => sum + v, 0)

  const recentTransactions = feed.slice(0, 5)

  const budgetHealthCards = useMemo(() => {
    if (!budgets.data) return []
    return budgets.data
      .map((budget) => {
        const spent = spendByCategory.get(budget.categoryId) ?? 0
        const percent = Number(budget.amount) > 0 ? (spent / Number(budget.amount)) * 100 : 0
        return { budget, spent, percent }
      })
      .filter(({ percent }) => percent >= 80)
      .sort((a, b) => b.percent - a.percent)
  }, [budgets.data, spendByCategory])

  function handleSaveCategory(input: { categoryId: string; subcategoryId: string | null; applyToVendor: boolean }) {
    if (!activeSheetItem) return
    overrides.upsert({ plaidTransactionId: activeSheetItem.id, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
    if (input.applyToVendor) {
      vendorMappings.upsert({ vendorName: activeSheetItem.merchantName, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
    }
    setActiveSheetItem(null)
  }

  function handleOpenReimbursement(input: { categoryId: string; subcategoryId: string | null }) {
    if (!activeSheetItem) return
    overrides.upsert({ plaidTransactionId: activeSheetItem.id, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
    setPendingReimbursementMeta(input)
    setReimbursementItem(activeSheetItem)
    setActiveSheetItem(null)
  }

  function handleSaveReimbursement(linkedIncomeIds: string[]) {
    if (!reimbursementItem) return
    for (const incomeId of linkedIncomeIds) {
      const incomeItem = feed.find((i) => i.id === incomeId)
      if (!incomeItem) continue
      reimbursements.create({
        expensePlaidTransactionId: reimbursementItem.source === 'plaid' ? reimbursementItem.id : null,
        expenseManualTransactionId: reimbursementItem.source === 'manual' ? reimbursementItem.id : null,
        incomePlaidTransactionId: incomeItem.source === 'plaid' ? incomeItem.id : null,
        incomeManualTransactionId: incomeItem.source === 'manual' ? incomeItem.id : null,
        amount: Math.abs(incomeItem.amount).toFixed(2),
        note: null,
      })
    }
    setReimbursementItem(null)
    setPendingReimbursementMeta(null)
  }

  const candidateIncomeItems = feed.filter((item) => item.amount < 0 && item.id !== reimbursementItem?.id)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerClassName="gap-6 px-5 py-4">
        <View className="flex-row items-center justify-between">
          <AccountsFilterDropdown accounts={accounts.data ?? []} selectedAccountId={selectedAccountId} onSelect={setSelectedAccountId} />
          <MonthNavigator month={month} onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
          <Ionicons name="paw" size={22} color={colors.textMuted} style={{ opacity: 0.4 }} />
        </View>

        {error ? <ErrorBanner message="Something went wrong loading your data." /> : null}

        <Pressable onPress={() => setExpensesOpen((v) => !v)} className="flex-row items-center gap-2">
          <Text className="font-sansSemi text-lg text-expense">Expenses {formatAmount(totalExpenses)}</Text>
          <Ionicons name={expensesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.expense} />
        </Pressable>
        {expensesOpen ? (
          <FlatList
            data={categories.data?.filter((c) => spendByCategory.has(c.id)) ?? []}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ gap: 12 }}
            keyExtractor={(c) => c.id}
            renderItem={({ item: category }) => (
              <CategoryCard
                name={category.name}
                icon={category.icon}
                color={category.color}
                spent={spendByCategory.get(category.id) ?? 0}
                budget={budgets.data?.find((b) => b.categoryId === category.id) ? Number(budgets.data.find((b) => b.categoryId === category.id)!.amount) : null}
              />
            )}
          />
        ) : null}

        <Pressable onPress={() => setIncomeOpen((v) => !v)} className="flex-row items-center gap-2">
          <Text className="font-sansSemi text-lg text-income">Income {formatAmount(totalIncome)}</Text>
          <Ionicons name={incomeOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.income} />
        </Pressable>
        {incomeOpen ? (
          <FlatList
            data={categories.data?.filter((c) => incomeTotals.has(c.id)) ?? []}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ gap: 12 }}
            keyExtractor={(c) => c.id}
            renderItem={({ item: category }) => (
              <CategoryCard name={category.name} icon={category.icon} color={category.color} spent={incomeTotals.get(category.id) ?? 0} budget={null} />
            )}
          />
        ) : null}

        {budgetHealthCards.length > 0 ? (
          <View className="gap-2">
            <Text className="font-sansSemi text-base text-textPrimary">Budget Health</Text>
            {budgetHealthCards.map(({ budget, spent }) => {
              const category = categoryById.get(budget.categoryId)
              return (
                <BudgetCard
                  key={budget.id}
                  categoryName={category?.name ?? 'Unknown'}
                  categoryIcon={category?.icon ?? '❓'}
                  spent={spent}
                  budget={Number(budget.amount)}
                />
              )
            })}
          </View>
        ) : null}

        <View className="gap-2">
          <Text className="font-sansSemi text-base text-textPrimary">Recent Transactions</Text>
          {recentTransactions.map((item) => {
            const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
            return (
              <TransactionRow
                key={item.id}
                item={item}
                categoryName={category?.name ?? 'Uncategorized'}
                categoryColor={category?.color ?? colors.textMuted}
                categoryIcon={category?.icon ?? '❓'}
                reimbursementCategoryName={item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null}
                onPress={() => setActiveSheetItem(item)}
              />
            )
          })}
        </View>
      </ScrollView>

      <CategorySheet
        visible={activeSheetItem != null}
        item={activeSheetItem}
        categories={categories.data ?? []}
        subcategories={subcategories.data ?? []}
        onClose={() => setActiveSheetItem(null)}
        onSave={handleSaveCategory}
        onOpenReimbursement={handleOpenReimbursement}
      />
      <ReimbursementSheet
        visible={reimbursementItem != null}
        expenseItem={reimbursementItem}
        candidateIncomeItems={candidateIncomeItems}
        onClose={() => {
          setReimbursementItem(null)
          setPendingReimbursementMeta(null)
        }}
        onSave={handleSaveReimbursement}
      />
    </SafeAreaView>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(tabs)/index.tsx"
git commit -m "feat: implement Dashboard screen"
```

---

## Task 13: Transactions screen — list view + FAB + sheets

**Files:**
- Modify: `frontend/app/(tabs)/transactions.tsx`

**Interfaces:**
- Consumes: everything Task 12 does, plus `useManualTransactions`; produces the base screen that Task 14 extends with calendar view.

- [ ] **Step 1: Replace `frontend/app/(tabs)/transactions.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { Pressable, SectionList, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { useAccounts } from '@/hooks/useAccounts'
import { useCategories } from '@/hooks/useCategories'
import { useSubcategories } from '@/hooks/useSubcategories'
import { useTransactionOverrides } from '@/hooks/useTransactionOverrides'
import { useVendorMappings } from '@/hooks/useVendorMappings'
import { useReimbursements } from '@/hooks/useReimbursements'
import { useManualTransactions } from '@/hooks/useManualTransactions'
import { TransactionRow } from '@/components/transactions/TransactionRow'
import { MonthNavigator } from '@/components/transactions/MonthNavigator'
import { AccountsFilterDropdown } from '@/components/ui/AccountsFilterDropdown'
import { CategorySheet } from '@/components/transactions/CategorySheet'
import { ReimbursementSheet } from '@/components/reimbursements/ReimbursementSheet'
import { ManualTransactionSheet } from '@/components/transactions/ManualTransactionSheet'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { formatAmount } from '@/lib/format/money'
import { currentMonth, filterByMonth, shiftMonth } from '@/lib/transactions/filterByMonth'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { ManualTransaction } from '@/types/domain'

export default function TransactionsScreen() {
  const [month, setMonth] = useState(currentMonth())
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [activeSheetItem, setActiveSheetItem] = useState<FeedItem | null>(null)
  const [reimbursementItem, setReimbursementItem] = useState<FeedItem | null>(null)
  const [manualSheetOpen, setManualSheetOpen] = useState(false)
  const [editingManualId, setEditingManualId] = useState<string | null>(null)

  const { feed, categoryById, isLoading, error } = useTransactionFeed()
  const accounts = useAccounts()
  const categories = useCategories()
  const subcategories = useSubcategories()
  const overrides = useTransactionOverrides()
  const vendorMappings = useVendorMappings()
  const reimbursements = useReimbursements()
  const manualTransactions = useManualTransactions()

  const accountFilteredFeed = useMemo(
    () => (selectedAccountId ? feed.filter((item) => item.accountId === selectedAccountId) : feed),
    [feed, selectedAccountId],
  )
  const monthFeed = useMemo(() => filterByMonth(accountFilteredFeed, month), [accountFilteredFeed, month])

  const sections = useMemo(() => {
    const byDate = new Map<string, FeedItem[]>()
    for (const item of monthFeed) {
      const bucket = byDate.get(item.date) ?? []
      bucket.push(item)
      byDate.set(item.date, bucket)
    }
    return Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({
        title: date,
        total: items.reduce((sum, i) => sum + (i.netAmount ?? i.amount), 0),
        data: items,
      }))
  }, [monthFeed])

  function handleSaveCategory(input: { categoryId: string; subcategoryId: string | null; applyToVendor: boolean }) {
    if (!activeSheetItem) return
    overrides.upsert({ plaidTransactionId: activeSheetItem.id, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
    if (input.applyToVendor) {
      vendorMappings.upsert({ vendorName: activeSheetItem.merchantName, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
    }
    setActiveSheetItem(null)
  }

  function handleOpenReimbursement(input: { categoryId: string; subcategoryId: string | null }) {
    if (!activeSheetItem) return
    overrides.upsert({ plaidTransactionId: activeSheetItem.id, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
    setReimbursementItem(activeSheetItem)
    setActiveSheetItem(null)
  }

  function handleSaveReimbursement(linkedIncomeIds: string[]) {
    if (!reimbursementItem) return
    for (const incomeId of linkedIncomeIds) {
      const incomeItem = feed.find((i) => i.id === incomeId)
      if (!incomeItem) continue
      reimbursements.create({
        expensePlaidTransactionId: reimbursementItem.source === 'plaid' ? reimbursementItem.id : null,
        expenseManualTransactionId: reimbursementItem.source === 'manual' ? reimbursementItem.id : null,
        incomePlaidTransactionId: incomeItem.source === 'plaid' ? incomeItem.id : null,
        incomeManualTransactionId: incomeItem.source === 'manual' ? incomeItem.id : null,
        amount: Math.abs(incomeItem.amount).toFixed(2),
        note: null,
      })
    }
    setReimbursementItem(null)
  }

  function handleSaveManual(input: { amount: string; type: 'expense' | 'income'; categoryId: string | null; subcategoryId: string | null; date: string; note: string | null }) {
    if (editingManualId) {
      manualTransactions.update({ id: editingManualId, ...input })
    } else {
      manualTransactions.create(input)
    }
    setManualSheetOpen(false)
    setEditingManualId(null)
  }

  function handleDeleteManual() {
    if (!editingManualId) return
    manualTransactions.delete({ id: editingManualId })
    setManualSheetOpen(false)
    setEditingManualId(null)
  }

  function handleRowPress(item: FeedItem) {
    if (item.source === 'manual') {
      setEditingManualId(item.id)
      setManualSheetOpen(true)
    } else {
      setActiveSheetItem(item)
    }
  }

  const editingManual: ManualTransaction | undefined = editingManualId
    ? manualTransactions.data?.find((m) => m.id === editingManualId)
    : undefined

  const candidateIncomeItems = feed.filter((item) => item.amount < 0 && item.id !== reimbursementItem?.id)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <AccountsFilterDropdown accounts={accounts.data ?? []} selectedAccountId={selectedAccountId} onSelect={setSelectedAccountId} />
        <MonthNavigator month={month} onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
        <Ionicons name="list" size={20} color={colors.primary} />
      </View>

      {error ? <ErrorBanner message="Something went wrong loading your transactions." /> : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 96 }}
        renderSectionHeader={({ section }) => (
          <View className="flex-row items-center justify-between bg-background py-2">
            <Text className="font-sansSemi text-sm text-textSecondary">{section.title}</Text>
            <Text className="font-mono text-sm text-textSecondary">{formatAmount(section.total)}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
          return (
            <TransactionRow
              item={item}
              categoryName={category?.name ?? 'Uncategorized'}
              categoryColor={category?.color ?? colors.textMuted}
              categoryIcon={category?.icon ?? '❓'}
              reimbursementCategoryName={item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null}
              onPress={() => handleRowPress(item)}
            />
          )
        }}
      />

      <Pressable
        onPress={() => {
          setEditingManualId(null)
          setManualSheetOpen(true)
        }}
        accessibilityLabel="Add Transaction"
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary"
        style={{ shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </Pressable>

      <CategorySheet
        visible={activeSheetItem != null}
        item={activeSheetItem}
        categories={categories.data ?? []}
        subcategories={subcategories.data ?? []}
        onClose={() => setActiveSheetItem(null)}
        onSave={handleSaveCategory}
        onOpenReimbursement={handleOpenReimbursement}
      />
      <ReimbursementSheet
        visible={reimbursementItem != null}
        expenseItem={reimbursementItem}
        candidateIncomeItems={candidateIncomeItems}
        onClose={() => setReimbursementItem(null)}
        onSave={handleSaveReimbursement}
      />
      <ManualTransactionSheet
        visible={manualSheetOpen}
        transaction={editingManual}
        categories={categories.data ?? []}
        subcategories={subcategories.data ?? []}
        isSaving={manualTransactions.isLoading}
        onClose={() => {
          setManualSheetOpen(false)
          setEditingManualId(null)
        }}
        onSave={handleSaveManual}
        onDelete={editingManualId ? handleDeleteManual : undefined}
      />
    </SafeAreaView>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(tabs)/transactions.tsx"
git commit -m "feat: implement Transactions screen list view with FAB and sheets"
```

---

## Task 14: Transactions screen — calendar view toggle

**Files:**
- Modify: `frontend/app/(tabs)/transactions.tsx`

**Interfaces:**
- Consumes: `CalendarCell` (existing); `spendByDay` from `useTransactionFeed`; extends Task 13's screen with a second view mode.

- [ ] **Step 1: Add calendar view mode to `frontend/app/(tabs)/transactions.tsx`**

Add to the imports:

```tsx
import { CalendarCell } from '@/components/transactions/CalendarCell'
```

Add local state near the top of the component (alongside the existing `useState` calls):

```tsx
const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
const [selectedDay, setSelectedDay] = useState<string | null>(null)
```

Replace the header's static `<Ionicons name="list" ... />` icon with a toggle pair:

```tsx
<View className="flex-row gap-3">
  <Pressable onPress={() => setViewMode('list')} accessibilityLabel="List view">
    <Ionicons name="list" size={20} color={viewMode === 'list' ? colors.primary : colors.textMuted} />
  </Pressable>
  <Pressable onPress={() => setViewMode('calendar')} accessibilityLabel="Calendar view">
    <Ionicons name="calendar" size={20} color={viewMode === 'calendar' ? colors.primary : colors.textMuted} />
  </Pressable>
</View>
```

Add a `spendByDay` destructure from `useTransactionFeed()` (it already returns this per the foundation — just add it to the existing destructure: `const { feed, categoryById, spendByDay, isLoading, error } = useTransactionFeed()`).

Compute the calendar's per-day data for the current month (add near `sections`):

```tsx
const daysInMonth = new Date(month.year, month.month, 0).getDate()
const firstWeekday = new Date(month.year, month.month - 1, 1).getDay()
const todayKey = new Date().toISOString().slice(0, 10)

const calendarDays = useMemo(() => {
  const days: Array<{ day: number; dateKey: string } | null> = []
  for (let i = 0; i < firstWeekday; i++) days.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    days.push({ day, dateKey })
  }
  return days
}, [month, daysInMonth, firstWeekday])

const monthSummary = useMemo(() => {
  let income = 0
  let expense = 0
  for (const item of monthFeed) {
    if (item.isReimbursementIncome) continue
    const net = item.netAmount ?? item.amount
    if (net > 0) expense += net
    else income += Math.abs(net)
  }
  return { income, expense, net: income - expense }
}, [monthFeed])

const selectedDayItems = selectedDay ? monthFeed.filter((item) => item.date === selectedDay) : []
```

Render calendar view conditionally, replacing the `<SectionList ... />` block with a conditional:

```tsx
{viewMode === 'list' ? (
  <SectionList
    sections={sections}
    keyExtractor={(item) => item.id}
    contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 96 }}
    renderSectionHeader={({ section }) => (
      <View className="flex-row items-center justify-between bg-background py-2">
        <Text className="font-sansSemi text-sm text-textSecondary">{section.title}</Text>
        <Text className="font-mono text-sm text-textSecondary">{formatAmount(section.total)}</Text>
      </View>
    )}
    renderItem={({ item }) => {
      const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
      return (
        <TransactionRow
          item={item}
          categoryName={category?.name ?? 'Uncategorized'}
          categoryColor={category?.color ?? colors.textMuted}
          categoryIcon={category?.icon ?? '❓'}
          reimbursementCategoryName={item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null}
          onPress={() => handleRowPress(item)}
        />
      )
    }}
  />
) : (
  <View className="flex-1 px-5">
    <View className="mb-4 flex-row flex-wrap">
      {calendarDays.map((cell, index) =>
        cell ? (
          <View key={cell.dateKey} style={{ width: '14.28%' }}>
            <CalendarCell
              day={cell.day}
              netAmount={spendByDay.get(cell.dateKey)?.net ?? null}
              hasReimbursement={spendByDay.get(cell.dateKey)?.hasReimbursement ?? false}
              isToday={cell.dateKey === todayKey}
              isSelected={cell.dateKey === selectedDay}
              onPress={() => setSelectedDay(cell.dateKey === selectedDay ? null : cell.dateKey)}
            />
          </View>
        ) : (
          <View key={`empty-${index}`} style={{ width: '14.28%' }} />
        ),
      )}
    </View>

    <View className="mb-4 flex-row justify-between rounded-md bg-surface p-4">
      <Text className="font-mono text-sm text-income">Income {formatAmount(monthSummary.income)}</Text>
      <Text className="font-mono text-sm text-expense">Expenses {formatAmount(monthSummary.expense)}</Text>
      <Text className="font-mono text-sm text-textPrimary">Net {formatAmount(monthSummary.net)}</Text>
    </View>

    {selectedDay ? (
      <FlatList
        data={selectedDayItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const category = item.categoryId ? categoryById.get(item.categoryId) : undefined
          return (
            <TransactionRow
              item={item}
              categoryName={category?.name ?? 'Uncategorized'}
              categoryColor={category?.color ?? colors.textMuted}
              categoryIcon={category?.icon ?? '❓'}
              reimbursementCategoryName={item.reimbursementCategoryId ? categoryById.get(item.reimbursementCategoryId)?.name ?? null : null}
              onPress={() => handleRowPress(item)}
            />
          )
        }}
      />
    ) : null}
  </View>
)}
```

Add `FlatList` to the existing `react-native` import line.

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(tabs)/transactions.tsx"
git commit -m "feat: add calendar view toggle to Transactions screen"
```

---

## Task 15: Budgets screen

**Files:**
- Modify: `frontend/app/(tabs)/budgets.tsx`

**Interfaces:**
- Consumes: `useTransactionFeed`, `useBudgets`, `useCategories` (existing); `BudgetProgressBar`, `BudgetCard`, `MonthNavigator`, `BottomSheet`, `TextField`, `SegmentedControl`, `Button` (existing); `filterByMonth` (Task 2).

- [ ] **Step 1: Replace `frontend/app/(tabs)/budgets.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { useTransactionFeed } from '@/hooks/useTransactionFeed'
import { useBudgets } from '@/hooks/useBudgets'
import { useCategories } from '@/hooks/useCategories'
import { BudgetCard } from '@/components/budgets/BudgetCard'
import { BudgetProgressBar } from '@/components/budgets/BudgetProgressBar'
import { MonthNavigator } from '@/components/transactions/MonthNavigator'
import { BottomSheet } from '@/components/ui/BottomSheet'
import { TextField } from '@/components/ui/TextField'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { formatAmount } from '@/lib/format/money'
import { currentMonth, filterByMonth, shiftMonth } from '@/lib/transactions/filterByMonth'
import type { Budget } from '@/types/domain'

export default function BudgetsScreen() {
  const [month, setMonth] = useState(currentMonth())
  const [settingCategoryId, setSettingCategoryId] = useState<string | null>(null)
  const [newAmount, setNewAmount] = useState('')
  const [newPeriod, setNewPeriod] = useState<Budget['period']>('monthly')

  const { feed, error } = useTransactionFeed()
  const budgets = useBudgets()
  const categories = useCategories()

  const monthFeed = useMemo(() => filterByMonth(feed, month), [feed, month])

  const spendByCategory = useMemo(() => {
    const totals = new Map<string, number>()
    for (const item of monthFeed) {
      if (item.amount <= 0 || !item.categoryId || item.isReimbursementIncome) continue
      totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + (item.netAmount ?? item.amount))
    }
    return totals
  }, [monthFeed])

  const categoryById = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data])

  const budgetedRows = useMemo(() => {
    return (budgets.data ?? [])
      .map((budget) => {
        const spent = spendByCategory.get(budget.categoryId) ?? 0
        const percent = Number(budget.amount) > 0 ? (spent / Number(budget.amount)) * 100 : 0
        return { budget, spent, percent }
      })
      .sort((a, b) => b.percent - a.percent)
  }, [budgets.data, spendByCategory])

  const unbudgetedCategories = useMemo(() => {
    const budgetedIds = new Set((budgets.data ?? []).map((b) => b.categoryId))
    return (categories.data ?? []).filter((c) => !budgetedIds.has(c.id))
  }, [categories.data, budgets.data])

  const totalSpent = Array.from(spendByCategory.values()).reduce((sum, v) => sum + v, 0)
  const totalBudget = (budgets.data ?? []).reduce((sum, b) => sum + Number(b.amount), 0)
  const overallPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

  function handleSetBudget() {
    if (!settingCategoryId || !newAmount) return
    budgets.create({ categoryId: settingCategoryId, amount: newAmount, period: newPeriod })
    setSettingCategoryId(null)
    setNewAmount('')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerClassName="gap-4 px-5 py-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sansSemi text-lg text-textPrimary">Budgets</Text>
          <MonthNavigator month={month} onPrevious={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
        </View>

        {error ? <ErrorBanner message="Something went wrong loading your budgets." /> : null}

        <View className="gap-2">
          <Text className="font-sans text-base text-textSecondary">
            Overall {formatAmount(totalSpent)} / {formatAmount(totalBudget)}
          </Text>
          <BudgetProgressBar percent={overallPercent} />
        </View>

        <View className="gap-3">
          {budgetedRows.map(({ budget, spent }) => (
            <BudgetCard
              key={budget.id}
              categoryName={categoryById.get(budget.categoryId)?.name ?? 'Unknown'}
              categoryIcon={categoryById.get(budget.categoryId)?.icon ?? '❓'}
              spent={spent}
              budget={Number(budget.amount)}
              onPress={() => router.push({ pathname: '/(tabs)/transactions', params: { categoryId: budget.categoryId } })}
            />
          ))}
        </View>

        {unbudgetedCategories.length > 0 ? (
          <View className="gap-2">
            <Text className="font-sansMed text-sm text-textMuted">No budget set</Text>
            {unbudgetedCategories.map((category) => (
              <View key={category.id} className="flex-row items-center justify-between rounded-md bg-surface p-4">
                <View className="flex-row items-center gap-2">
                  <Text style={{ fontSize: 18 }}>{category.icon}</Text>
                  <Text className="font-sansMed text-base text-textPrimary">{category.name}</Text>
                </View>
                <Text
                  onPress={() => setSettingCategoryId(category.id)}
                  className="font-sansMed text-sm text-primary"
                >
                  Set
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <BottomSheet visible={settingCategoryId != null} onClose={() => setSettingCategoryId(null)}>
        <Text className="mb-4 font-sansSemi text-lg text-textPrimary">Set Budget</Text>
        <TextField label="Amount" value={newAmount} onChangeText={setNewAmount} keyboardType="decimal-pad" placeholder="200.00" mono />
        <View className="mt-4">
          <SegmentedControl
            options={[
              { label: 'Weekly', value: 'weekly' as const },
              { label: 'Monthly', value: 'monthly' as const },
              { label: 'Yearly', value: 'yearly' as const },
            ]}
            value={newPeriod}
            onChange={setNewPeriod}
          />
        </View>
        <View className="mt-4">
          <Button label="Save Budget" onPress={handleSetBudget} disabled={!newAmount} />
        </View>
      </BottomSheet>
    </SafeAreaView>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(tabs)/budgets.tsx"
git commit -m "feat: implement Budgets screen"
```

---

## Task 16: Accounts screen (`Settings → Accounts`)

**Files:**
- Create: `frontend/app/(tabs)/settings/accounts.tsx`
- Modify: `frontend/app/(tabs)/settings/_layout.tsx`
- Modify: `frontend/app/(tabs)/settings/index.tsx`

**Interfaces:**
- Consumes: `useAccounts`, `usePlaidCredentials` (existing), `usePlaidLink` (Task 4); `HeroCard`, `AccountRow` (existing); `createPlaidLinkSession` (existing, from onboarding).

- [ ] **Step 1: Register the route in `frontend/app/(tabs)/settings/_layout.tsx`**

Add one line inside the `<Stack>`:

```tsx
<Stack.Screen name="accounts" options={{ title: 'Accounts' }} />
```

- [ ] **Step 2: Add a settings row in `frontend/app/(tabs)/settings/index.tsx`**

Add a new `SettingsRow` inside the existing "Accounts" section `<View>` (before the "Plaid Developer Account" row, matching product.md's ordering):

```tsx
<SettingsRow icon="card" label="Accounts" onPress={() => router.push('/(tabs)/settings/accounts')} />
```

- [ ] **Step 3: Create `frontend/app/(tabs)/settings/accounts.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { router } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { createPlaidLinkSession } from 'react-native-plaid-link-sdk'
import { colors } from '@/constants/theme'
import { useAccounts } from '@/hooks/useAccounts'
import { usePlaidCredentials } from '@/hooks/usePlaidCredentials'
import { usePlaidLink } from '@/hooks/usePlaidLink'
import { HeroCard } from '@/components/dashboard/HeroCard'
import { AccountRow } from '@/components/accounts/AccountRow'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

// Plaid's AccountType enum: 'investment' | 'credit' | 'depository' | 'loan' | 'brokerage' | 'other'.
function isCreditAccount(account: { type: string }): boolean {
  return account.type === 'credit'
}

function isInvestmentAccount(account: { type: string }): boolean {
  return account.type === 'investment' || account.type === 'brokerage'
}

export default function AccountsScreen() {
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const accounts = useAccounts()
  const credentials = usePlaidCredentials()
  const { createLinkToken, exchangeToken } = usePlaidLink()

  const cashAccounts = useMemo(() => (accounts.data ?? []).filter((a) => !isCreditAccount(a)), [accounts.data])
  const creditAccounts = useMemo(() => (accounts.data ?? []).filter(isCreditAccount), [accounts.data])

  const totalAssets = cashAccounts.reduce((sum, a) => sum + (a.balances?.current ?? 0), 0)
  const totalLiabilities = creditAccounts.reduce((sum, a) => sum + (a.balances?.current ?? 0), 0)

  async function handleAddAccount() {
    setError(null)
    if (!credentials.data) {
      router.push('/(tabs)/settings/plaid-account')
      return
    }

    setIsConnecting(true)
    try {
      const { linkToken } = await createLinkToken()
      const session = await createPlaidLinkSession({
        token: linkToken,
        onEvent: () => {},
        onExit: (exit) => {
          setIsConnecting(false)
          if (exit.error) setError(exit.error.errorMessage ?? 'Bank connection was cancelled.')
        },
        onSuccess: async (success) => {
          try {
            await exchangeToken({ publicToken: success.publicToken })
            accounts.data && (await Promise.resolve())
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not finish linking this account.')
          } finally {
            setIsConnecting(false)
          }
        },
      })
      await session.open()
    } catch (err) {
      setIsConnecting(false)
      setError(err instanceof Error ? err.message : 'Could not open Plaid Link. Try again.')
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerClassName="gap-6 px-5 py-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sansSemi text-lg text-textPrimary">All Accounts</Text>
          <Pressable onPress={handleAddAccount} accessibilityLabel="Add account" disabled={isConnecting}>
            <Ionicons name="add-circle" size={26} color={colors.primary} />
          </Pressable>
        </View>

        {error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}

        <HeroCard
          netWorth={totalAssets - totalLiabilities}
          totalAssets={totalAssets}
          totalLiabilities={totalLiabilities}
          isLoading={accounts.isLoading}
        />

        {cashAccounts.length > 0 ? (
          <View className="gap-1">
            <Text className="font-sansMed text-sm text-textMuted">CASH ACCOUNTS</Text>
            {cashAccounts.map((account) => (
              <AccountRow
                key={account.account_id}
                name={account.name}
                balance={account.balances?.current ?? 0}
                variant={isInvestmentAccount(account) ? 'investment' : 'cash'}
              />
            ))}
          </View>
        ) : null}

        {creditAccounts.length > 0 ? (
          <View className="gap-1">
            <Text className="font-sansMed text-sm text-textMuted">CREDIT ACCOUNTS</Text>
            {creditAccounts.map((account) => (
              <AccountRow
                key={account.account_id}
                name={account.name}
                balance={account.balances?.current ?? 0}
                variant="credit"
                limit={account.balances?.limit ?? null}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
```

`account.type` and `account.balances.limit` come straight from Plaid's `AccountBase` shape (confirmed against the installed `plaid` SDK's type declarations — relayed as-is per architecture.md, never persisted), so `isCreditAccount`/`isInvestmentAccount` above compare against the exact enum values Plaid sends.

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(tabs)/settings/accounts.tsx" "frontend/app/(tabs)/settings/_layout.tsx" "frontend/app/(tabs)/settings/index.tsx"
git commit -m "feat: implement Accounts screen at Settings -> Accounts"
```

---

## Task 17: Settings → Categories list screen

**Files:**
- Create: `frontend/app/(tabs)/settings/categories.tsx`
- Modify: `frontend/app/(tabs)/settings/_layout.tsx`
- Modify: `frontend/app/(tabs)/settings/index.tsx`

**Interfaces:**
- Consumes: `useCategories` (existing).
- Produces: the list screen; routes to `category-form` (Task 18) for create/edit.

- [ ] **Step 1: Register the route in `frontend/app/(tabs)/settings/_layout.tsx`**

```tsx
<Stack.Screen name="categories" options={{ title: 'Categories' }} />
<Stack.Screen name="category-form" options={{ title: 'Category' }} />
```

- [ ] **Step 2: Add a settings row in `frontend/app/(tabs)/settings/index.tsx`**

```tsx
<SettingsRow icon="pricetags" label="Categories" onPress={() => router.push('/(tabs)/settings/categories')} />
```

- [ ] **Step 3: Create `frontend/app/(tabs)/settings/categories.tsx`**

```tsx
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { useCategories } from '@/hooks/useCategories'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

export default function CategoriesListScreen() {
  const categories = useCategories()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <ScrollView contentContainerClassName="gap-4 px-5 py-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-sansSemi text-lg text-textPrimary">Categories</Text>
          <Pressable onPress={() => router.push({ pathname: '/(tabs)/settings/category-form' })} accessibilityLabel="Add category">
            <Ionicons name="add-circle" size={26} color={colors.primary} />
          </Pressable>
        </View>

        {categories.error ? <ErrorBanner message="Could not load categories." /> : null}

        <View className="gap-1 rounded-md bg-surface">
          {(categories.data ?? []).map((category) => (
            <Pressable
              key={category.id}
              onPress={() => router.push({ pathname: '/(tabs)/settings/category-form', params: { id: category.id } })}
              className="flex-row items-center gap-3 px-4 py-4"
            >
              <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: `${category.color}30` }}>
                <Text style={{ fontSize: 16 }}>{category.icon}</Text>
              </View>
              <Text className="font-sansMed text-base text-textPrimary">{category.name}</Text>
              <View className="ml-auto">
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
```

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(tabs)/settings/categories.tsx" "frontend/app/(tabs)/settings/_layout.tsx" "frontend/app/(tabs)/settings/index.tsx"
git commit -m "feat: implement Categories list screen"
```

---

## Task 18: Settings → Category create/edit screen

**Files:**
- Create: `frontend/app/(tabs)/settings/category-form.tsx`

**Interfaces:**
- Consumes: `CategoryForm` (Task 8), `useCategories`, `usePlaidCategoryMappings` (Task 4).

- [ ] **Step 1: Create `frontend/app/(tabs)/settings/category-form.tsx`**

```tsx
import { useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '@/constants/theme'
import { useCategories } from '@/hooks/useCategories'
import { usePlaidCategoryMappings } from '@/hooks/usePlaidCategoryMappings'
import { CategoryForm } from '@/components/categories/CategoryForm'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { PFC_TAXONOMY } from '@/constants/plaid'

function primaryForCode(detailedCode: string): string {
  const group = PFC_TAXONOMY.find((g) => g.detailedCodes.includes(detailedCode))
  if (!group) throw new Error(`Unknown PFC code: ${detailedCode}`)
  return group.primary
}

export default function CategoryFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const [error, setError] = useState<string | null>(null)
  const categories = useCategories()
  const mappings = usePlaidCategoryMappings()

  const category = id ? categories.data?.find((c) => c.id === id) : undefined

  async function handleSave(input: { name: string; color: string; icon: string; selectedCodes: Set<string> }) {
    setError(null)
    try {
      const savedCategory = category
        ? await categories.update({ id: category.id, name: input.name, color: input.color, icon: input.icon })
        : await categories.create({ name: input.name, color: input.color, icon: input.icon })

      const existingCodes = new Set(
        (mappings.data ?? [])
          .filter((m) => m.categoryId === savedCategory.id && m.plaidPfcDetailed)
          .map((m) => m.plaidPfcDetailed as string),
      )

      for (const code of input.selectedCodes) {
        if (!existingCodes.has(code)) {
          await mappings.create({ plaidPfcPrimary: primaryForCode(code), plaidPfcDetailed: code, categoryId: savedCategory.id })
        }
      }
      for (const existingMapping of mappings.data ?? []) {
        if (
          existingMapping.categoryId === savedCategory.id &&
          existingMapping.plaidPfcDetailed &&
          !input.selectedCodes.has(existingMapping.plaidPfcDetailed)
        ) {
          await mappings.delete({ id: existingMapping.id })
        }
      }

      router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this category.')
    }
  }

  async function handleDelete() {
    if (!category) return
    setError(null)
    try {
      await categories.delete({ id: category.id })
      router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this category.')
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View className="px-5 pt-2">{error ? <ErrorBanner message={error} onDismiss={() => setError(null)} /> : null}</View>
      <CategoryForm
        category={category}
        mappings={mappings.data ?? []}
        categories={categories.data ?? []}
        isSaving={false}
        onSave={handleSave}
        onDelete={category ? handleDelete : undefined}
      />
    </SafeAreaView>
  )
}
```

The `primaryForCode` helper looks up each detailed code's owning primary from the static taxonomy (Task 1) rather than string-splitting, since several primaries are multi-word (e.g. `FOOD_AND_DRINK_COFFEE`'s primary is `FOOD_AND_DRINK`, not `FOOD`).

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(tabs)/settings/category-form.tsx"
git commit -m "feat: implement Category create/edit screen"
```

---

## Final Verification

- [ ] **Run the full backend suite:** `cd backend && npm test` — expect all passing (this phase makes no backend changes, so this just confirms nothing regressed).
- [ ] **Run the full frontend suite:** `cd frontend && npx vitest run` — expect all existing tests plus the new `filterByMonth.test.ts` and `pfcOwnership.test.ts` passing.
- [ ] **Run a full frontend type-check:** `cd frontend && npx tsc --noEmit` — expect no errors.
- [ ] **Attempt to launch the app** via the `run` skill (Expo iOS simulator) and click through: Dashboard (category cards render, tapping a recent transaction opens the sheet), Transactions (list + calendar toggle, FAB opens manual-transaction sheet, categorizing a transaction, marking one as reimbursed), Budgets (setting a budget on an unbudgeted category, tapping a budget card navigates to Transactions), Settings → Accounts (linking a new account if a sandbox Plaid environment is configured), Settings → Categories (creating a category with PFC codes, editing one, attempting delete). If the sandbox can't launch a simulator, state that explicitly rather than claiming the golden path was verified.
