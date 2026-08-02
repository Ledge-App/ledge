# Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the client-side transaction engine (MMKV raw cache, cursor-based sync, category resolution, feed merging, reimbursement math) and the shared visual components (CategoryCard, TransactionRow, HeroCard, AccountRow, BudgetCard, CalendarCell, BottomSheet, CategoryPicker) that every core-app screen (Dashboard, Accounts, Transactions, Budgets, Settings→Categories) will consume in later sub-projects.

**Architecture:** Compute-on-read. MMKV persists only the raw Plaid transaction array + sync cursor per linked item. Everything else (categories, budgets, vendor mappings, overrides, manual transactions, reimbursements, accounts) comes from react-query via the existing `api` tRPC client. A pure function module (`lib/transactions/resolveFeed.ts`) recomputes the categorized, merged, reimbursement-aware feed fresh on every read — no persisted derived state, no invalidation surface beyond react-query's own.

**Tech Stack:** React Native (Expo, RN 0.86), NativeWind (Tailwind for RN), `@trpc/react-query`, `react-native-mmkv`, `react-native-svg`, `react-native-reanimated`, Vitest (frontend gets a Vitest setup for the first time in this plan, matching the backend's existing convention).

## Global Constraints

- Strict one-way layering: Components → Hooks → API client. Components never call hooks or the API client directly except through props; hooks never import components. (architecture.md, Architecture Layers)
- Design tokens are the only source of truth — every color, font, spacing, radius value in a component comes from `constants/theme.ts` / the NativeWind classes derived from it. No hardcoded hex/px/font-name literals in components. (architecture.md constraint 7)
- No `<form>` tags — controlled inputs with `onChangeText`/`onPress` only. (architecture.md constraint 9)
- Never persist raw Plaid transaction/balance data server-side — this plan's backend changes only touch relay/typing logic, never add persistence. (architecture.md constraint 10)
- All amounts in lists use `font-mono`; hero/summary amounts use `font-display`; section headers use `font-sansSemi`. (design.md Typography)
- Budget/category health color coding is always teal (<70%), amber (70–90%), rose (>90%) — never repurposed for anything else. (design.md, Design Principles)
- Follow the existing hook pattern established by `hooks/usePlaidCredentials.ts`: thin wrapper over `api.<router>.<procedure>.useQuery/useMutation`, returns `{ data, isLoading, error, ...mutations }`, mutations invalidate their own query via `utils.<router>.<procedure>.invalidate()` in `onSuccess`.
- Privacy/masking context is out of scope for this plan (per the approved spec) — components render real, unmasked amounts. `HeroCard` keeps its own local eye-toggle state (explicitly specified in design.md as belonging to that component), not a global context.

---

## Task 1: Backend — isolate per-item sync failures in `transactionSyncService`

**Files:**
- Modify: `backend/src/services/transactionSyncService.ts`
- Test: `backend/src/services/transactionSyncService.test.ts` (new)

**Interfaces:**
- Produces: `TransactionSyncResult` (`{ added: Transaction[], modified: Transaction[], removed: RemovedTransaction[], cursors: Record<string,string>, hasMore: boolean, itemErrors: { itemId: string, message: string }[] }`) — the `transactions.sync` router's return type, consumed by the frontend's `useTransactionFeed` in Task 10.

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/transactionSyncService.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const credRepoMock = { getDecrypted: vi.fn() }
const itemRepoMock = { listDecryptedTokens: vi.fn() }
const transactionRepoMock = { sync: vi.fn() }
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: credRepoMock }))
vi.mock('../repositories/plaidItemRepository.js', () => ({ plaidItemRepository: itemRepoMock }))
vi.mock('../repositories/transactionRepository.js', () => ({ transactionRepository: transactionRepoMock }))
vi.mock('../lib/plaid/client.js', () => ({ createPlaidClient: vi.fn(() => ({})) }))

describe('transactionSyncService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('isolates a failing item so other items still sync and return data', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-good', accessToken: 'a1', institutionName: 'Chase' },
      { itemId: 'item-bad', accessToken: 'a2', institutionName: 'Broken Bank' },
    ])
    transactionRepoMock.sync.mockImplementation(async (_client: unknown, accessToken: string) => {
      if (accessToken === 'a2') throw new Error('ITEM_LOGIN_REQUIRED')
      return { added: [{ transaction_id: 't1' }], modified: [], removed: [], next_cursor: 'cursor-good', has_more: false }
    })

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', { 'item-good': '', 'item-bad': 'old-cursor' })

    expect(result.added).toEqual([{ transaction_id: 't1' }])
    expect(result.cursors).toEqual({ 'item-good': 'cursor-good' })
    expect(result.itemErrors).toEqual([{ itemId: 'item-bad', message: 'ITEM_LOGIN_REQUIRED' }])
  })

  it('returns empty results with no errors when there are no linked items', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([])

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', {})

    expect(result).toEqual({ added: [], modified: [], removed: [], cursors: {}, hasMore: false, itemErrors: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/transactionSyncService.test.ts`
Expected: FAIL — current `sync` throws on the first error instead of isolating it, and returns no `itemErrors` field.

- [ ] **Step 3: Implement the isolation + typing fix**

Replace `backend/src/services/transactionSyncService.ts` with:

```ts
import type { RemovedTransaction, Transaction } from 'plaid'
import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'
import { transactionRepository } from '../repositories/transactionRepository.js'

export interface TransactionSyncItemError {
  itemId: string
  message: string
}

export interface TransactionSyncResult {
  added: Transaction[]
  modified: Transaction[]
  removed: RemovedTransaction[]
  cursors: Record<string, string>
  hasMore: boolean
  itemErrors: TransactionSyncItemError[]
}

export const transactionSyncService = {
  async sync(userId: string, cursors: Record<string, string>): Promise<TransactionSyncResult> {
    const creds = await plaidCredentialRepository.getDecrypted(userId)
    if (!creds) throw new Error('No Plaid credentials saved for this user.')
    const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)
    const items = await plaidItemRepository.listDecryptedTokens(userId)

    const added: Transaction[] = []
    const modified: Transaction[] = []
    const removed: RemovedTransaction[] = []
    const nextCursors: Record<string, string> = {}
    const itemErrors: TransactionSyncItemError[] = []
    let hasMore = false

    for (const item of items) {
      const cursor = cursors[item.itemId] ?? ''
      try {
        const page = await transactionRepository.sync(client, item.accessToken, cursor)
        added.push(...page.added)
        modified.push(...page.modified)
        removed.push(...page.removed)
        nextCursors[item.itemId] = page.next_cursor
        hasMore = hasMore || page.has_more
      } catch (err) {
        // One user's misconfigured/broken Plaid item must not block sync for their other
        // items (architecture.md's BYOK isolation tradeoff). Cursor is left unset so the
        // next sync retries this item from where it last succeeded.
        itemErrors.push({ itemId: item.itemId, message: err instanceof Error ? err.message : 'Sync failed for this account.' })
      }
    }

    // Relay only — nothing here is written to a table (see Constraint 10 in the plan header).
    return { added, modified, removed, cursors: nextCursors, hasMore, itemErrors }
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/transactionSyncService.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Update the router test to match, and run the full backend suite**

`backend/src/routers/transactions.test.ts` mocks `transactionSyncService` entirely so no change is needed there, but confirm nothing else broke:

Run: `cd backend && npm test`
Expected: All existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/transactionSyncService.ts backend/src/services/transactionSyncService.test.ts
git commit -m "feat: isolate per-item Plaid sync failures in transactionSyncService"
```

---

## Task 2: Backend — expose `itemId` on `accounts.list`

**Files:**
- Modify: `backend/src/routers/accounts.ts`
- Modify: `backend/src/routers/accounts.test.ts`

**Interfaces:**
- Produces: each element of `accounts.list`'s array now includes `itemId: string` alongside the existing Plaid account fields and `institutionName`. Consumed by the frontend's `useTransactionFeed` (Task 10) to key the MMKV cache per linked item.

- [ ] **Step 1: Update the existing test's expectation first (it currently asserts the field is absent)**

In `backend/src/routers/accounts.test.ts`, change the final `expect`:

```ts
    expect(result).toEqual([
      { account_id: 'acc-1', name: 'Sapphire', balances: { current: 4821 }, institutionName: 'Chase', itemId: 'item-1' },
    ])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routers/accounts.test.ts`
Expected: FAIL — actual result is missing `itemId`.

- [ ] **Step 3: Add `itemId` to the router's mapped result**

In `backend/src/routers/accounts.ts`, change:

```ts
      for (const account of accounts) {
        results.push({ ...account, institutionName: item.institutionName })
      }
```

to:

```ts
      for (const account of accounts) {
        results.push({ ...account, itemId: item.itemId, institutionName: item.institutionName })
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routers/accounts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routers/accounts.ts backend/src/routers/accounts.test.ts
git commit -m "feat: expose itemId on accounts.list for per-item transaction cache keying"
```

---

## Task 3: Frontend — add Vitest + `react-native-mmkv`

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`

**Interfaces:**
- Produces: `npm test` / `npm run test:watch` scripts in `frontend/`, and the `react-native-mmkv` package available for Task 5.

- [ ] **Step 1: Add dependencies and scripts to `frontend/package.json`**

Add to `dependencies`:
```json
    "react-native-mmkv": "^3.1.0",
```

Add to `devDependencies`:
```json
    "vitest": "^2.0.5",
```

Add to `scripts`:
```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 2: Install**

Run: `cd frontend && npm install`
Expected: installs cleanly, `package-lock.json` updates.

- [ ] **Step 3: Create `frontend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
})
```

Test files in this plan use relative imports (not the `@/` alias) so no path-alias resolver is needed here — keeps this config minimal, matching the backend's.

- [ ] **Step 4: Verify the runner works with an empty test suite**

Run: `cd frontend && npm test`
Expected: "No test files found" (or passes with 0 tests) — confirms Vitest itself is wired up before Task 5 adds real tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts
git commit -m "chore: add Vitest and react-native-mmkv to frontend"
```

---

## Task 4: Frontend — shared domain types from the backend router

**Files:**
- Create: `frontend/types/domain.ts`

**Interfaces:**
- Consumes: `AppRouter` from `frontend/types/backend.ts` (already exists).
- Produces: `Category`, `Subcategory`, `VendorMapping`, `TransactionOverride`, `ManualTransaction`, `Budget`, `Reimbursement`, `Account`, `PlaidTransaction`, `TransactionSyncResult` — used by every hook and by `resolveFeed.ts` in later tasks.

- [ ] **Step 1: Create `frontend/types/domain.ts`**

```ts
// Types inferred directly from the backend router's output shapes — no hand-maintained
// duplicate type definitions to drift out of sync. Type-only, erased at compile time
// (see types/backend.ts's note on why this is safe to import from the mobile bundle).
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from './backend'

type RouterOutputs = inferRouterOutputs<AppRouter>

export type Category = RouterOutputs['categories']['list'][number]
export type Subcategory = RouterOutputs['subcategories']['list'][number]
export type VendorMapping = RouterOutputs['vendorMappings']['list'][number]
export type TransactionOverride = RouterOutputs['transactionOverrides']['list'][number]
export type ManualTransaction = RouterOutputs['manualTransactions']['list'][number]
export type Budget = RouterOutputs['budgets']['list'][number]
export type Reimbursement = RouterOutputs['reimbursements']['list'][number]
export type Account = RouterOutputs['accounts']['list'][number]
export type TransactionSyncResult = RouterOutputs['transactions']['sync']
export type PlaidTransaction = TransactionSyncResult['added'][number]
```

- [ ] **Step 2: Verify it type-checks against the backend's current router shapes**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors attributable to `types/domain.ts`. (Pre-existing unrelated errors, if any, are out of scope — only confirm this file introduces none.)

- [ ] **Step 3: Commit**

```bash
git add frontend/types/domain.ts
git commit -m "feat: add shared domain types inferred from the backend router"
```

---

## Task 5: Frontend — MMKV raw transaction cache

**Files:**
- Create: `frontend/lib/storage/mmkv.ts`
- Test: `frontend/lib/storage/mmkv.test.ts`

**Interfaces:**
- Consumes: `PlaidTransaction` from `@/types/domain` (Task 4).
- Produces: `getCachedTransactions(itemId)`, `setCachedTransactions(itemId, txns)`, `getCursor(itemId)`, `setCursor(itemId, cursor)` — consumed by `useTransactionFeed` (Task 10).

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/storage/mmkv.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native-mmkv', () => {
  class FakeMMKV {
    private store = new Map<string, string>()
    getString(key: string) {
      return this.store.get(key)
    }
    set(key: string, value: string) {
      this.store.set(key, value)
    }
  }
  return { MMKV: FakeMMKV }
})

describe('mmkv storage', () => {
  beforeEach(() => vi.resetModules())

  it('round-trips cached transactions per item, defaulting to an empty array', async () => {
    const { getCachedTransactions, setCachedTransactions } = await import('./mmkv')
    expect(getCachedTransactions('item-1')).toEqual([])

    const txns = [{ transaction_id: 't1' }] as never
    setCachedTransactions('item-1', txns)

    expect(getCachedTransactions('item-1')).toEqual(txns)
  })

  it('round-trips the sync cursor per item, independent of other items', async () => {
    const { getCursor, setCursor } = await import('./mmkv')
    expect(getCursor('item-1')).toBeUndefined()

    setCursor('item-1', 'cursor-abc')
    setCursor('item-2', 'cursor-xyz')

    expect(getCursor('item-1')).toBe('cursor-abc')
    expect(getCursor('item-2')).toBe('cursor-xyz')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/storage/mmkv.test.ts`
Expected: FAIL with "Cannot find module './mmkv'"

- [ ] **Step 3: Implement `frontend/lib/storage/mmkv.ts`**

```ts
import { MMKV } from 'react-native-mmkv'
import type { PlaidTransaction } from '@/types/domain'

const storage = new MMKV({ id: 'ledge-transaction-cache' })

function transactionsKey(itemId: string): string {
  return `transactions:${itemId}`
}

function cursorKey(itemId: string): string {
  return `cursor:${itemId}`
}

export function getCachedTransactions(itemId: string): PlaidTransaction[] {
  const raw = storage.getString(transactionsKey(itemId))
  return raw ? (JSON.parse(raw) as PlaidTransaction[]) : []
}

export function setCachedTransactions(itemId: string, transactions: PlaidTransaction[]): void {
  storage.set(transactionsKey(itemId), JSON.stringify(transactions))
}

export function getCursor(itemId: string): string | undefined {
  return storage.getString(cursorKey(itemId))
}

export function setCursor(itemId: string, cursor: string): void {
  storage.set(cursorKey(itemId), cursor)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/storage/mmkv.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/storage/mmkv.ts frontend/lib/storage/mmkv.test.ts
git commit -m "feat: add MMKV raw transaction cache"
```

---

## Task 6: Frontend — `resolveCategory` (category resolution priority order)

**Files:**
- Create: `frontend/lib/transactions/resolveFeed.ts`
- Test: `frontend/lib/transactions/resolveFeed.test.ts`

**Interfaces:**
- Consumes: `TransactionOverride`, `VendorMapping` from `@/types/domain` (Task 4).
- Produces: `CategorySource` (`'override' | 'user_defined' | 'plaid_auto' | 'uncategorized'`), `ResolvedCategory` (`{ categoryId: string | null, subcategoryId: string | null, categorySource: CategorySource }`), `resolveCategory(txn, overrides, vendorMappings)` — consumed by `mergeFeed` (Task 7).

- [ ] **Step 1: Write the failing test**

Create `frontend/lib/transactions/resolveFeed.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveCategory } from './resolveFeed'
import type { TransactionOverride, VendorMapping } from '@/types/domain'

const overrides: TransactionOverride[] = [
  { id: 'o1', plaidTransactionId: 'txn-override', categoryId: 'cat-override', subcategoryId: null },
]
const vendorMappings: VendorMapping[] = [
  { id: 'v1', vendorName: 'Panda Express', categoryId: 'cat-user', subcategoryId: 'sub-user', source: 'user_defined' },
  { id: 'v2', vendorName: 'Panda Express', categoryId: 'cat-auto', subcategoryId: null, source: 'plaid_auto' },
  { id: 'v3', vendorName: 'Only Auto Vendor', categoryId: 'cat-auto-only', subcategoryId: null, source: 'plaid_auto' },
]

describe('resolveCategory', () => {
  it('prefers a transaction_override over any vendor mapping', () => {
    const result = resolveCategory({ transactionId: 'txn-override', merchantName: 'Panda Express' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: 'cat-override', subcategoryId: null, categorySource: 'override' })
  })

  it('prefers a user_defined vendor mapping over a plaid_auto one for the same merchant', () => {
    const result = resolveCategory({ transactionId: 'txn-other', merchantName: 'Panda Express' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: 'cat-user', subcategoryId: 'sub-user', categorySource: 'user_defined' })
  })

  it('falls back to plaid_auto when no user_defined mapping exists for the merchant', () => {
    const result = resolveCategory({ transactionId: 'txn-other', merchantName: 'Only Auto Vendor' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: 'cat-auto-only', subcategoryId: null, categorySource: 'plaid_auto' })
  })

  it('falls back to uncategorized when nothing matches', () => {
    const result = resolveCategory({ transactionId: 'txn-unknown', merchantName: 'Unknown Merchant' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: null, subcategoryId: null, categorySource: 'uncategorized' })
  })

  it('falls back to uncategorized when merchantName is null', () => {
    const result = resolveCategory({ transactionId: 'txn-null-merchant', merchantName: null }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: null, subcategoryId: null, categorySource: 'uncategorized' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/transactions/resolveFeed.test.ts`
Expected: FAIL with "Cannot find module './resolveFeed'"

- [ ] **Step 3: Implement `resolveCategory` in `frontend/lib/transactions/resolveFeed.ts`**

```ts
import type { TransactionOverride, VendorMapping } from '@/types/domain'

export type CategorySource = 'override' | 'user_defined' | 'plaid_auto' | 'uncategorized'

export interface ResolvedCategory {
  categoryId: string | null
  subcategoryId: string | null
  categorySource: CategorySource
}

// Implements product.md's 4-step category resolution order:
// transaction_overrides > user_defined vendor_mappings > plaid_auto vendor_mappings > Uncategorized.
export function resolveCategory(
  txn: { transactionId: string; merchantName: string | null },
  overrides: TransactionOverride[],
  vendorMappings: VendorMapping[],
): ResolvedCategory {
  const override = overrides.find((o) => o.plaidTransactionId === txn.transactionId)
  if (override) {
    return { categoryId: override.categoryId, subcategoryId: override.subcategoryId, categorySource: 'override' }
  }

  const userDefined = txn.merchantName
    ? vendorMappings.find((v) => v.vendorName === txn.merchantName && v.source === 'user_defined')
    : undefined
  if (userDefined) {
    return { categoryId: userDefined.categoryId, subcategoryId: userDefined.subcategoryId, categorySource: 'user_defined' }
  }

  const plaidAuto = txn.merchantName
    ? vendorMappings.find((v) => v.vendorName === txn.merchantName && v.source === 'plaid_auto')
    : undefined
  if (plaidAuto) {
    return { categoryId: plaidAuto.categoryId, subcategoryId: plaidAuto.subcategoryId, categorySource: 'plaid_auto' }
  }

  return { categoryId: null, subcategoryId: null, categorySource: 'uncategorized' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/transactions/resolveFeed.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/transactions/resolveFeed.ts frontend/lib/transactions/resolveFeed.test.ts
git commit -m "feat: add category resolution priority order (resolveCategory)"
```

---

## Task 7: Frontend — `mergeFeed` (Plaid + manual transaction merge)

**Files:**
- Modify: `frontend/lib/transactions/resolveFeed.ts`
- Modify: `frontend/lib/transactions/resolveFeed.test.ts`

**Interfaces:**
- Consumes: `resolveCategory` (Task 6), `PlaidTransaction`, `ManualTransaction`, `TransactionOverride`, `VendorMapping` from `@/types/domain`.
- Produces: `FeedItem` (see below), `mergeFeed(plaidTransactions, manualTransactions, overrides, vendorMappings): FeedItem[]` — consumed by `applyReimbursements` (Task 8) and `useTransactionFeed` (Task 10).

```ts
export interface FeedItem {
  id: string
  source: 'plaid' | 'manual'
  amount: number // Plaid convention: positive = money out (expense), negative = money in (income)
  date: string
  merchantName: string
  categoryId: string | null
  subcategoryId: string | null
  categorySource: CategorySource
  confidenceLevel: string | null
  accountId: string | null
  pending: boolean
  note: string | null
  reimbursedAmount: number | null
  netAmount: number | null
  isReimbursementIncome: boolean
  reimbursementCategoryId: string | null
}
```

- [ ] **Step 1: Write the failing test**

Append to `frontend/lib/transactions/resolveFeed.test.ts`:

```ts
import { mergeFeed } from './resolveFeed'
import type { ManualTransaction, PlaidTransaction } from '@/types/domain'

describe('mergeFeed', () => {
  const plaidTxns = [
    {
      transaction_id: 'p1',
      account_id: 'acc-1',
      amount: 35.5,
      date: '2026-06-21',
      name: 'PANDA EXPRESS #123',
      merchant_name: 'Panda Express',
      pending: false,
      personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_FAST_FOOD', confidence_level: 'HIGH' },
    },
  ] as unknown as PlaidTransaction[]

  const manualTxns = [
    { id: 'm1', amount: '5.00', type: 'expense', categoryId: 'cat-food', subcategoryId: null, date: '2026-06-20', note: 'Street food' },
    { id: 'm2', amount: '30.00', type: 'income', categoryId: null, subcategoryId: null, date: '2026-06-19', note: 'Zelle from Alice' },
  ] as ManualTransaction[]

  it('merges Plaid and manual transactions into one array, sorted by date descending', () => {
    const feed = mergeFeed(plaidTxns, manualTxns, [], [])
    expect(feed.map((item) => item.id)).toEqual(['p1', 'm1', 'm2'])
  })

  it('tags each item with its source and resolves Plaid category via resolveCategory', () => {
    const vendorMappings = [{ id: 'v1', vendorName: 'Panda Express', categoryId: 'cat-food', subcategoryId: null, source: 'plaid_auto' as const }]
    const feed = mergeFeed(plaidTxns, [], [], vendorMappings)
    expect(feed[0]).toMatchObject({ source: 'plaid', categoryId: 'cat-food', categorySource: 'plaid_auto', merchantName: 'Panda Express' })
  })

  it('gives manual expenses a positive amount and manual income a negative amount, matching Plaid convention', () => {
    const feed = mergeFeed([], manualTxns, [], [])
    const expense = feed.find((item) => item.id === 'm1')!
    const income = feed.find((item) => item.id === 'm2')!
    expect(expense.amount).toBe(5)
    expect(income.amount).toBe(-30)
  })

  it('uses the manual transaction note as its display merchant name', () => {
    const feed = mergeFeed([], manualTxns, [], [])
    expect(feed.find((item) => item.id === 'm1')!.merchantName).toBe('Street food')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/transactions/resolveFeed.test.ts`
Expected: FAIL with "mergeFeed is not a function" (or similar)

- [ ] **Step 3: Implement `mergeFeed`, appending to `frontend/lib/transactions/resolveFeed.ts`**

```ts
import type { ManualTransaction, PlaidTransaction, TransactionOverride, VendorMapping } from '@/types/domain'

export interface FeedItem {
  id: string
  source: 'plaid' | 'manual'
  amount: number
  date: string
  merchantName: string
  categoryId: string | null
  subcategoryId: string | null
  categorySource: CategorySource
  confidenceLevel: string | null
  accountId: string | null
  pending: boolean
  note: string | null
  reimbursedAmount: number | null
  netAmount: number | null
  isReimbursementIncome: boolean
  reimbursementCategoryId: string | null
}

export function mergeFeed(
  plaidTransactions: PlaidTransaction[],
  manualTransactions: ManualTransaction[],
  overrides: TransactionOverride[],
  vendorMappings: VendorMapping[],
): FeedItem[] {
  const plaidItems: FeedItem[] = plaidTransactions.map((txn) => {
    const resolved = resolveCategory(
      { transactionId: txn.transaction_id, merchantName: txn.merchant_name ?? null },
      overrides,
      vendorMappings,
    )
    return {
      id: txn.transaction_id,
      source: 'plaid',
      amount: txn.amount,
      date: txn.date,
      merchantName: txn.merchant_name ?? txn.name,
      categoryId: resolved.categoryId,
      subcategoryId: resolved.subcategoryId,
      categorySource: resolved.categorySource,
      confidenceLevel: txn.personal_finance_category?.confidence_level ?? null,
      accountId: txn.account_id,
      pending: txn.pending,
      note: null,
      reimbursedAmount: null,
      netAmount: null,
      isReimbursementIncome: false,
      reimbursementCategoryId: null,
    }
  })

  const manualItems: FeedItem[] = manualTransactions.map((txn) => ({
    id: txn.id,
    source: 'manual',
    amount: txn.type === 'expense' ? Number(txn.amount) : -Number(txn.amount),
    date: txn.date,
    merchantName: txn.note ?? (txn.type === 'expense' ? 'Manual expense' : 'Manual income'),
    categoryId: txn.categoryId,
    subcategoryId: txn.subcategoryId,
    categorySource: txn.categoryId ? 'user_defined' : 'uncategorized',
    confidenceLevel: null,
    accountId: null,
    pending: false,
    note: txn.note,
    reimbursedAmount: null,
    netAmount: null,
    isReimbursementIncome: false,
    reimbursementCategoryId: null,
  }))

  return [...plaidItems, ...manualItems].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/transactions/resolveFeed.test.ts`
Expected: PASS (9 tests total: 5 from Task 6 + 4 new)

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/transactions/resolveFeed.ts frontend/lib/transactions/resolveFeed.test.ts
git commit -m "feat: merge Plaid and manual transactions into one sorted feed"
```

---

## Task 8: Frontend — `applyReimbursements` (net-expense math + reimbursement tagging)

**Files:**
- Modify: `frontend/lib/transactions/resolveFeed.ts`
- Modify: `frontend/lib/transactions/resolveFeed.test.ts`

**Interfaces:**
- Consumes: `FeedItem` (Task 7), `Reimbursement` from `@/types/domain`.
- Produces: `applyReimbursements(feed, reimbursements): FeedItem[]` — consumed by `useTransactionFeed` (Task 10).

- [ ] **Step 1: Write the failing test**

Append to `frontend/lib/transactions/resolveFeed.test.ts`:

```ts
import { applyReimbursements } from './resolveFeed'
import type { Reimbursement } from '@/types/domain'

describe('applyReimbursements', () => {
  const baseFeed: FeedItem[] = [
    {
      id: 'expense-1', source: 'plaid', amount: 100, date: '2026-06-21', merchantName: 'Dinner', categoryId: 'cat-food',
      subcategoryId: null, categorySource: 'plaid_auto', confidenceLevel: 'HIGH', accountId: 'acc-1', pending: false,
      note: null, reimbursedAmount: null, netAmount: null, isReimbursementIncome: false, reimbursementCategoryId: null,
    },
    {
      id: 'income-alice', source: 'plaid', amount: -30, date: '2026-06-19', merchantName: 'Zelle from Alice', categoryId: 'cat-transfers-in',
      subcategoryId: null, categorySource: 'plaid_auto', confidenceLevel: 'HIGH', accountId: 'acc-1', pending: false,
      note: null, reimbursedAmount: null, netAmount: null, isReimbursementIncome: false, reimbursementCategoryId: null,
    },
    {
      id: 'income-bob', source: 'plaid', amount: -30, date: '2026-06-20', merchantName: 'Zelle from Bob', categoryId: 'cat-transfers-in',
      subcategoryId: null, categorySource: 'plaid_auto', confidenceLevel: 'HIGH', accountId: 'acc-1', pending: false,
      note: null, reimbursedAmount: null, netAmount: null, isReimbursementIncome: false, reimbursementCategoryId: null,
    },
  ]

  const reimbursements: Reimbursement[] = [
    { id: 'r1', expensePlaidTransactionId: 'expense-1', expenseManualTransactionId: null, incomePlaidTransactionId: 'income-alice', incomeManualTransactionId: null, amount: '30.00', note: null },
    { id: 'r2', expensePlaidTransactionId: 'expense-1', expenseManualTransactionId: null, incomePlaidTransactionId: 'income-bob', incomeManualTransactionId: null, amount: '30.00', note: null },
  ]

  it('computes net expense as original minus the sum of all linked reimbursements', () => {
    const result = applyReimbursements(baseFeed, reimbursements)
    const expense = result.find((item) => item.id === 'expense-1')!
    expect(expense.reimbursedAmount).toBe(60)
    expect(expense.netAmount).toBe(40)
  })

  it('tags each linked income row as a reimbursement, carrying the expense category', () => {
    const result = applyReimbursements(baseFeed, reimbursements)
    const alice = result.find((item) => item.id === 'income-alice')!
    expect(alice.isReimbursementIncome).toBe(true)
    expect(alice.reimbursementCategoryId).toBe('cat-food')
  })

  it('never lets net expense go negative when reimbursements exceed the original amount', () => {
    const overReimbursed: Reimbursement[] = [
      { id: 'r1', expensePlaidTransactionId: 'expense-1', expenseManualTransactionId: null, incomePlaidTransactionId: 'income-alice', incomeManualTransactionId: null, amount: '150.00', note: null },
    ]
    const result = applyReimbursements(baseFeed, overReimbursed)
    expect(result.find((item) => item.id === 'expense-1')!.netAmount).toBe(0)
  })

  it('leaves unrelated feed items unchanged', () => {
    const result = applyReimbursements(baseFeed, [])
    expect(result).toEqual(baseFeed)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run lib/transactions/resolveFeed.test.ts`
Expected: FAIL with "applyReimbursements is not a function"

- [ ] **Step 3: Implement `applyReimbursements`, appending to `frontend/lib/transactions/resolveFeed.ts`**

```ts
import type { ManualTransaction, PlaidTransaction, Reimbursement, TransactionOverride, VendorMapping } from '@/types/domain'

export function applyReimbursements(feed: FeedItem[], reimbursements: Reimbursement[]): FeedItem[] {
  const reimbursementsByExpenseId = new Map<string, Reimbursement[]>()
  for (const r of reimbursements) {
    const expenseId = r.expensePlaidTransactionId ?? r.expenseManualTransactionId
    if (!expenseId) continue
    const list = reimbursementsByExpenseId.get(expenseId) ?? []
    list.push(r)
    reimbursementsByExpenseId.set(expenseId, list)
  }

  const categoryByFeedId = new Map(feed.map((item) => [item.id, item.categoryId]))
  const incomeIdToExpenseCategoryId = new Map<string, string | null>()
  for (const r of reimbursements) {
    const incomeId = r.incomePlaidTransactionId ?? r.incomeManualTransactionId
    if (!incomeId) continue
    const expenseId = r.expensePlaidTransactionId ?? r.expenseManualTransactionId
    incomeIdToExpenseCategoryId.set(incomeId, expenseId ? categoryByFeedId.get(expenseId) ?? null : null)
  }

  return feed.map((item) => {
    const linked = reimbursementsByExpenseId.get(item.id)
    if (linked) {
      const reimbursedAmount = linked.reduce((sum, r) => sum + Number(r.amount), 0)
      const netAmount = Math.max(0, item.amount - reimbursedAmount)
      return { ...item, reimbursedAmount, netAmount }
    }
    if (incomeIdToExpenseCategoryId.has(item.id)) {
      return { ...item, isReimbursementIncome: true, reimbursementCategoryId: incomeIdToExpenseCategoryId.get(item.id) ?? null }
    }
    return item
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run lib/transactions/resolveFeed.test.ts`
Expected: PASS (13 tests total)

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/transactions/resolveFeed.ts frontend/lib/transactions/resolveFeed.test.ts
git commit -m "feat: compute reimbursement net-expense and tag reimbursement income rows"
```

---

## Task 9: Frontend — simple CRUD hooks (one per remaining router)

**Files:**
- Create: `frontend/hooks/useCategories.ts`
- Create: `frontend/hooks/useSubcategories.ts`
- Create: `frontend/hooks/useBudgets.ts`
- Create: `frontend/hooks/useVendorMappings.ts`
- Create: `frontend/hooks/useTransactionOverrides.ts`
- Create: `frontend/hooks/useManualTransactions.ts`
- Create: `frontend/hooks/useReimbursements.ts`
- Create: `frontend/hooks/useAccounts.ts`

**Interfaces:**
- Consumes: `api` from `@/lib/api/client` (existing).
- Produces: one hook per router, each returning `{ data, isLoading, error, ...mutations }` — consumed by `useTransactionFeed` (Task 10) and by every screen sub-project after this one.

No tests for this task — these are thin, mechanical react-query wrappers following the exact pattern already established (and left untested) by `hooks/usePlaidCredentials.ts`. Verification is a manual TypeScript check.

- [ ] **Step 1: Create `frontend/hooks/useCategories.ts`**

```ts
import { api } from '@/lib/api/client'

export function useCategories() {
  const utils = api.useUtils()
  const categories = api.categories.list.useQuery()
  const createMutation = api.categories.create.useMutation({ onSuccess: () => utils.categories.list.invalidate() })
  const updateMutation = api.categories.update.useMutation({ onSuccess: () => utils.categories.list.invalidate() })
  const deleteMutation = api.categories.delete.useMutation({ onSuccess: () => utils.categories.list.invalidate() })

  return {
    data: categories.data,
    isLoading: categories.isLoading,
    error: categories.error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
```

- [ ] **Step 2: Create `frontend/hooks/useSubcategories.ts`**

```ts
import { api } from '@/lib/api/client'

export function useSubcategories(categoryId?: string) {
  const utils = api.useUtils()
  const subcategories = api.subcategories.list.useQuery({ categoryId })
  const createMutation = api.subcategories.create.useMutation({ onSuccess: () => utils.subcategories.list.invalidate() })
  const updateMutation = api.subcategories.update.useMutation({ onSuccess: () => utils.subcategories.list.invalidate() })
  const deleteMutation = api.subcategories.delete.useMutation({ onSuccess: () => utils.subcategories.list.invalidate() })

  return {
    data: subcategories.data,
    isLoading: subcategories.isLoading,
    error: subcategories.error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
```

- [ ] **Step 3: Create `frontend/hooks/useBudgets.ts`**

```ts
import { api } from '@/lib/api/client'

export function useBudgets() {
  const utils = api.useUtils()
  const budgets = api.budgets.list.useQuery()
  const createMutation = api.budgets.create.useMutation({ onSuccess: () => utils.budgets.list.invalidate() })
  const updateMutation = api.budgets.update.useMutation({ onSuccess: () => utils.budgets.list.invalidate() })
  const deleteMutation = api.budgets.delete.useMutation({ onSuccess: () => utils.budgets.list.invalidate() })

  return {
    data: budgets.data,
    isLoading: budgets.isLoading,
    error: budgets.error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
```

- [ ] **Step 4: Create `frontend/hooks/useVendorMappings.ts`**

```ts
import { api } from '@/lib/api/client'

export function useVendorMappings() {
  const utils = api.useUtils()
  const vendorMappings = api.vendorMappings.list.useQuery()
  const upsertMutation = api.vendorMappings.upsert.useMutation({ onSuccess: () => utils.vendorMappings.list.invalidate() })
  const bulkRecategorizeMutation = api.vendorMappings.bulkRecategorize.useMutation({
    onSuccess: () => utils.vendorMappings.list.invalidate(),
  })

  return {
    data: vendorMappings.data,
    isLoading: vendorMappings.isLoading,
    error: vendorMappings.error,
    upsert: upsertMutation.mutateAsync,
    bulkRecategorize: bulkRecategorizeMutation.mutateAsync,
  }
}
```

- [ ] **Step 5: Create `frontend/hooks/useTransactionOverrides.ts`**

```ts
import { api } from '@/lib/api/client'

export function useTransactionOverrides() {
  const utils = api.useUtils()
  const overrides = api.transactionOverrides.list.useQuery()
  const upsertMutation = api.transactionOverrides.upsert.useMutation({ onSuccess: () => utils.transactionOverrides.list.invalidate() })
  const deleteMutation = api.transactionOverrides.delete.useMutation({ onSuccess: () => utils.transactionOverrides.list.invalidate() })

  return {
    data: overrides.data,
    isLoading: overrides.isLoading,
    error: overrides.error,
    upsert: upsertMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
```

- [ ] **Step 6: Create `frontend/hooks/useManualTransactions.ts`**

```ts
import { api } from '@/lib/api/client'

export function useManualTransactions() {
  const utils = api.useUtils()
  const manualTransactions = api.manualTransactions.list.useQuery()
  const createMutation = api.manualTransactions.create.useMutation({ onSuccess: () => utils.manualTransactions.list.invalidate() })
  const updateMutation = api.manualTransactions.update.useMutation({ onSuccess: () => utils.manualTransactions.list.invalidate() })
  const deleteMutation = api.manualTransactions.delete.useMutation({ onSuccess: () => utils.manualTransactions.list.invalidate() })

  return {
    data: manualTransactions.data,
    isLoading: manualTransactions.isLoading,
    error: manualTransactions.error,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
```

- [ ] **Step 7: Create `frontend/hooks/useReimbursements.ts`**

```ts
import { api } from '@/lib/api/client'

export function useReimbursements() {
  const utils = api.useUtils()
  const reimbursements = api.reimbursements.list.useQuery()
  const createMutation = api.reimbursements.create.useMutation({ onSuccess: () => utils.reimbursements.list.invalidate() })
  const deleteMutation = api.reimbursements.delete.useMutation({ onSuccess: () => utils.reimbursements.list.invalidate() })

  return {
    data: reimbursements.data,
    isLoading: reimbursements.isLoading,
    error: reimbursements.error,
    create: createMutation.mutateAsync,
    delete: deleteMutation.mutateAsync,
  }
}
```

- [ ] **Step 8: Create `frontend/hooks/useAccounts.ts`**

```ts
import { api } from '@/lib/api/client'

export function useAccounts() {
  const accounts = api.accounts.list.useQuery()

  return {
    data: accounts.data,
    isLoading: accounts.isLoading,
    error: accounts.error,
  }
}
```

- [ ] **Step 9: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors attributable to these 8 files.

- [ ] **Step 10: Commit**

```bash
git add frontend/hooks/useCategories.ts frontend/hooks/useSubcategories.ts frontend/hooks/useBudgets.ts frontend/hooks/useVendorMappings.ts frontend/hooks/useTransactionOverrides.ts frontend/hooks/useManualTransactions.ts frontend/hooks/useReimbursements.ts frontend/hooks/useAccounts.ts
git commit -m "feat: add CRUD hooks for categories, budgets, vendor mappings, overrides, manual transactions, reimbursements, and accounts"
```

---

## Task 10: Frontend — `useTransactionFeed` orchestrator hook

**Files:**
- Create: `frontend/hooks/useTransactionFeed.ts`

**Interfaces:**
- Consumes: `useAccounts`, `useManualTransactions`, `useTransactionOverrides`, `useVendorMappings`, `useCategories`, `useReimbursements` (Task 9); `getCachedTransactions`, `setCachedTransactions`, `getCursor`, `setCursor` (Task 5); `mergeFeed`, `applyReimbursements` (Tasks 7–8); `PlaidTransaction` (Task 4).
- Produces: `{ feed: FeedItem[], categoryById: Map<string, Category>, spendByCategory: Map<string, number>, isLoading: boolean, error: unknown, itemErrors: {itemId, message}[], refresh: () => void }` — this is the primary data source every screen sub-project (Dashboard, Transactions, Budgets) will consume.

No unit test for this task (it's a hook orchestrating other hooks + side effects — per the plan's testing decision, only pure `lib/` logic is unit-tested; this hook gets manual verification once a screen in a later sub-project consumes it).

- [ ] **Step 1: Create `frontend/hooks/useTransactionFeed.ts`**

```ts
import { useMemo } from 'react'
import { api } from '@/lib/api/client'
import { useAccounts } from './useAccounts'
import { useManualTransactions } from './useManualTransactions'
import { useTransactionOverrides } from './useTransactionOverrides'
import { useVendorMappings } from './useVendorMappings'
import { useCategories } from './useCategories'
import { useReimbursements } from './useReimbursements'
import { getCachedTransactions, setCachedTransactions, getCursor, setCursor } from '@/lib/storage/mmkv'
import { applyReimbursements, mergeFeed } from '@/lib/transactions/resolveFeed'
import type { PlaidTransaction } from '@/types/domain'

export function useTransactionFeed() {
  const accounts = useAccounts()
  const manualTransactions = useManualTransactions()
  const overrides = useTransactionOverrides()
  const vendorMappings = useVendorMappings()
  const categories = useCategories()
  const reimbursements = useReimbursements()

  const itemIds = useMemo(() => Array.from(new Set((accounts.data ?? []).map((a) => a.itemId))), [accounts.data])

  const accountIdToItemId = useMemo(() => {
    const map = new Map<string, string>()
    for (const account of accounts.data ?? []) map.set(account.account_id, account.itemId)
    return map
  }, [accounts.data])

  const cursors = useMemo(() => {
    const map: Record<string, string> = {}
    for (const itemId of itemIds) {
      const cursor = getCursor(itemId)
      if (cursor) map[itemId] = cursor
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIds])

  const sync = api.transactions.sync.useQuery(
    { cursors },
    {
      enabled: itemIds.length > 0,
      onSuccess: (result) => {
        const byItem = new Map<string, PlaidTransaction[]>()
        for (const itemId of itemIds) byItem.set(itemId, getCachedTransactions(itemId))

        const removedIds = new Set(result.removed.map((r) => r.transaction_id))
        const modifiedIds = new Set(result.modified.map((t) => t.transaction_id))

        for (const [itemId, cached] of byItem) {
          byItem.set(
            itemId,
            cached.filter((t) => !removedIds.has(t.transaction_id) && !modifiedIds.has(t.transaction_id)),
          )
        }

        for (const txn of [...result.added, ...result.modified]) {
          const itemId = accountIdToItemId.get(txn.account_id)
          if (!itemId) continue
          const bucket = byItem.get(itemId) ?? []
          bucket.push(txn)
          byItem.set(itemId, bucket)
        }

        for (const [itemId, transactions] of byItem) setCachedTransactions(itemId, transactions)
        for (const [itemId, cursor] of Object.entries(result.cursors)) setCursor(itemId, cursor)
      },
    },
  )

  const rawTransactions = useMemo(
    () => itemIds.flatMap((itemId) => getCachedTransactions(itemId)),
    // Re-derive whenever a sync completes (dataUpdatedAt changes), since MMKV writes
    // happen as a side effect of that query rather than through React state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [itemIds, sync.dataUpdatedAt],
  )

  const feed = useMemo(() => {
    if (!manualTransactions.data || !overrides.data || !vendorMappings.data) return []
    const merged = mergeFeed(rawTransactions, manualTransactions.data, overrides.data, vendorMappings.data)
    return applyReimbursements(merged, reimbursements.data ?? [])
  }, [rawTransactions, manualTransactions.data, overrides.data, vendorMappings.data, reimbursements.data])

  const categoryById = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c])), [categories.data])

  const spendByCategory = useMemo(() => {
    const totals = new Map<string, number>()
    for (const item of feed) {
      if (item.amount <= 0 || !item.categoryId) continue
      const net = item.netAmount ?? item.amount
      totals.set(item.categoryId, (totals.get(item.categoryId) ?? 0) + net)
    }
    return totals
  }, [feed])

  return {
    feed,
    categoryById,
    spendByCategory,
    isLoading:
      accounts.isLoading || manualTransactions.isLoading || overrides.isLoading || vendorMappings.isLoading || categories.isLoading,
    error: accounts.error ?? manualTransactions.error ?? overrides.error ?? vendorMappings.error ?? categories.error,
    itemErrors: sync.data?.itemErrors ?? [],
    refresh: () => sync.refetch(),
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors attributable to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/hooks/useTransactionFeed.ts
git commit -m "feat: add useTransactionFeed orchestrator hook"
```

---

## Task 11: Frontend — `BottomSheet` primitive

**Files:**
- Create: `frontend/components/ui/BottomSheet.tsx`

**Interfaces:**
- Produces: `<BottomSheet visible={boolean} onClose={() => void}>{children}</BottomSheet>` — the base every future sheet (category picker sheet, reimbursement sheet, add/edit manual transaction sheet) builds on in later sub-projects.

- [ ] **Step 1: Create `frontend/components/ui/BottomSheet.tsx`**

```tsx
import { useEffect } from 'react'
import { Modal, Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { borderRadius, colors } from '@/constants/theme'

interface BottomSheetProps {
  visible: boolean
  onClose: () => void
  children: React.ReactNode
}

// Base primitive for every bottom sheet in the app (category picker, reimbursement sheet,
// add/edit manual transaction sheet — built in later sub-projects on top of this).
export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const translateY = useSharedValue(600)

  useEffect(() => {
    translateY.value = withSpring(visible ? 0 : 600, { damping: 20, stiffness: 180 })
  }, [visible, translateY])

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))

  if (!visible) return null

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose} accessibilityLabel="Close">
        <Pressable onPress={() => {}}>
          <Animated.View
            style={[
              { backgroundColor: colors.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl },
              animatedStyle,
            ]}
            className="max-h-[85%] px-5 pb-8 pt-3"
          >
            <View className="mb-4 h-1 w-10 self-center rounded-full bg-border" />
            {children}
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors attributable to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ui/BottomSheet.tsx
git commit -m "feat: add BottomSheet primitive"
```

---

## Task 12: Frontend — `CategoryCard`

**Files:**
- Create: `frontend/components/categories/CategoryCard.tsx`

**Interfaces:**
- Produces: `<CategoryCard name icon color spent budget onPress? />` — used by Dashboard and Budgets screens in later sub-projects.

- [ ] **Step 1: Create `frontend/components/categories/CategoryCard.tsx`**

```tsx
import { useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import { colors, hexToRgba } from '@/constants/theme'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const RING_SIZE = 56
const RING_STROKE = 5
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface CategoryCardProps {
  name: string
  icon: string
  color: string
  spent: number
  budget: number | null
  onPress?: () => void
}

function ringColor(percent: number): string {
  if (percent > 90) return colors.expense
  if (percent >= 70) return colors.warning
  return colors.primary
}

export function CategoryCard({ name, icon, color, spent, budget, onPress }: CategoryCardProps) {
  const percent = budget && budget > 0 ? (spent / budget) * 100 : 0
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withTiming(budget ? Math.min(percent, 100) / 100 : 0, { duration: 600, easing: Easing.out(Easing.ease) })
  }, [percent, budget, progress])

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.value) }))

  // cardSurface/iconBg formula per design.md's "Category Card Tints" section — the canonical
  // pastel-fill derivation from the 2026-08 light-mode pivot.
  const cardSurface = hexToRgba(color, 0.16)
  const iconBg = hexToRgba(color, 0.28)
  const stroke = budget ? ringColor(percent) : colors.border

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className="flex-1 gap-3 rounded-lg p-4"
      style={{ backgroundColor: cardSurface }}
    >
      <Text className="font-sansSemi text-sm text-textSecondary">{name}</Text>

      <View className="items-center justify-center" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={colors.border}
            strokeWidth={RING_STROKE}
            fill="none"
            // Dashed outline when no budget is set (design.md Empty States).
            strokeDasharray={budget ? undefined : `${RING_CIRCUMFERENCE * 0.06} ${RING_CIRCUMFERENCE * 0.04}`}
          />
          {budget ? (
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={stroke}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeLinecap="round"
              animatedProps={animatedProps}
            />
          ) : null}
        </Svg>
        <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: iconBg }}>
          <Text style={{ fontSize: 18 }}>{icon}</Text>
        </View>
      </View>

      <View className="gap-0.5">
        <Text className="font-display text-lg text-textPrimary">${spent.toFixed(2)}</Text>
        <Text className="font-sans text-xs text-textMuted">{budget ? `of $${budget.toFixed(2)} budget` : 'Set budget'}</Text>
      </View>
    </Pressable>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors attributable to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/categories/CategoryCard.tsx
git commit -m "feat: add CategoryCard with animated arc ring"
```

---

## Task 13: Frontend — `CategoryPicker`

**Files:**
- Create: `frontend/components/categories/CategoryPicker.tsx`

**Interfaces:**
- Consumes: `Category` from `@/types/domain`.
- Produces: `<CategoryPicker categories selectedCategoryId onSelect />` — shared by the transaction-detail sheet and add-manual-transaction sheet, built in later sub-projects.

- [ ] **Step 1: Create `frontend/components/categories/CategoryPicker.tsx`**

```tsx
import { Pressable, ScrollView, Text } from 'react-native'
import { hexToRgba } from '@/constants/theme'
import type { Category } from '@/types/domain'

interface CategoryPickerProps {
  categories: Category[]
  selectedCategoryId: string | null
  onSelect: (categoryId: string) => void
}

export function CategoryPicker({ categories, selectedCategoryId, onSelect }: CategoryPickerProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
      {categories.map((category) => {
        const isSelected = category.id === selectedCategoryId
        return (
          <Pressable
            key={category.id}
            onPress={() => onSelect(category.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            className="w-20 items-center gap-2 rounded-md p-3"
            style={{
              backgroundColor: hexToRgba(category.color, isSelected ? 0.28 : 0.16),
              borderWidth: isSelected ? 2 : 0,
              borderColor: category.color,
            }}
          >
            <Text style={{ fontSize: 22 }}>{category.icon}</Text>
            <Text className="text-center font-sansMed text-xs text-textPrimary" numberOfLines={1}>
              {category.name}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors attributable to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/categories/CategoryPicker.tsx
git commit -m "feat: add CategoryPicker"
```

---

## Task 14: Frontend — `TransactionRow`

**Files:**
- Create: `frontend/components/transactions/TransactionRow.tsx`

**Interfaces:**
- Consumes: `FeedItem` from `@/lib/transactions/resolveFeed` (Task 7).
- Produces: `<TransactionRow item categoryName categoryColor categoryIcon onPress? />` — used by the Transactions screen (list and calendar views) and Dashboard's "recent transactions" in later sub-projects.

- [ ] **Step 1: Create `frontend/components/transactions/TransactionRow.tsx`**

```tsx
import { Pressable, Text, View } from 'react-native'
import { colors, hexToRgba } from '@/constants/theme'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

interface TransactionRowProps {
  item: FeedItem
  categoryName: string
  categoryColor: string
  categoryIcon: string
  onPress?: () => void
}

function formatAmount(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  return `${sign}$${Math.abs(amount).toFixed(2)}`
}

export function TransactionRow({ item, categoryName, categoryColor, categoryIcon, onPress }: TransactionRowProps) {
  const isIncome = item.amount < 0
  const amountColor = item.isReimbursementIncome ? colors.income : isIncome ? colors.income : colors.expense
  const iconColor = item.isReimbursementIncome ? colors.reimbursed : categoryColor
  const iconBg = item.isReimbursementIncome ? hexToRgba(colors.reimbursed, 0.18) : hexToRgba(categoryColor, 0.18)

  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 py-3">
      <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: iconBg }}>
        <Text style={{ fontSize: 18, color: iconColor }}>{item.isReimbursementIncome ? '↩️' : categoryIcon}</Text>
        {item.source === 'manual' ? (
          <View className="absolute -bottom-0.5 -right-0.5 h-4 w-4 items-center justify-center rounded-full bg-surface">
            <Text style={{ fontSize: 10 }}>✏️</Text>
          </View>
        ) : null}
      </View>

      <View className="flex-1 gap-0.5">
        <Text className="font-sansSemi text-base text-textPrimary">
          {item.isReimbursementIncome ? 'Reimbursement' : categoryName}
        </Text>
        <Text className="font-sans text-sm text-textSecondary" numberOfLines={1}>
          {item.merchantName}
        </Text>
      </View>

      <View className="items-end gap-0.5">
        {item.reimbursedAmount != null && item.netAmount != null ? (
          <Text className="font-mono text-base" style={{ color: colors.reimbursed }}>
            [${item.amount.toFixed(2)} → ${item.netAmount.toFixed(2)}]
          </Text>
        ) : (
          <Text className="font-mono text-base" style={{ color: amountColor }}>
            {formatAmount(item.amount)}
          </Text>
        )}
        {item.confidenceLevel === 'MEDIUM' ? <Text style={{ fontSize: 11 }}>❓</Text> : null}
      </View>
    </Pressable>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors attributable to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/transactions/TransactionRow.tsx
git commit -m "feat: add TransactionRow with Plaid/manual/reimbursement variants"
```

---

## Task 15: Frontend — `HeroCard`

**Files:**
- Create: `frontend/components/dashboard/HeroCard.tsx`

**Interfaces:**
- Produces: `<HeroCard netWorth totalAssets totalLiabilities isLoading />` — used by the Accounts screen in a later sub-project. Own internal loading skeleton and privacy-mask toggle (component-local state, not the deferred global context).

- [ ] **Step 1: Create `frontend/components/dashboard/HeroCard.tsx`**

```tsx
import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors } from '@/constants/theme'

interface HeroCardProps {
  netWorth: number | null
  totalAssets: number | null
  totalLiabilities: number | null
  isLoading: boolean
}

function formatAmount(amount: number | null, isMasked: boolean): string {
  if (isMasked) return '$****'
  if (amount == null) return '—'
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Balances here are fetched live through the backend on each view and never persisted
// server-side (architecture.md) — this card carries its own loading skeleton, independent
// of the rest of the Accounts screen.
export function HeroCard({ netWorth, totalAssets, totalLiabilities, isLoading }: HeroCardProps) {
  const [isMasked, setIsMasked] = useState(false)

  return (
    <View className="overflow-hidden rounded-xl p-5" style={{ backgroundColor: colors.primaryDim }}>
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => setIsMasked((m) => !m)}
          accessibilityLabel={isMasked ? 'Show amounts' : 'Hide amounts'}
          className="flex-row items-center gap-2"
        >
          <Ionicons name={isMasked ? 'eye-off' : 'eye'} size={18} color={colors.textInverse} />
          <Text className="font-sansMed text-sm text-textInverse">Net Worth</Text>
        </Pressable>
        <Ionicons name="trending-up" size={18} color={colors.textInverse} style={{ opacity: 0.5 }} />
      </View>

      <View className="mb-6 mt-4">
        {isLoading ? (
          <View className="h-9 w-40 rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }} />
        ) : (
          <Text className="font-display text-3xl text-textInverse">{formatAmount(netWorth, isMasked)}</Text>
        )}
      </View>

      <Svg width="100%" height={24} viewBox="0 0 300 24" style={{ position: 'absolute', bottom: 56, opacity: 0.5 }}>
        <Path d="M0 12 Q 37.5 0 75 12 T 150 12 T 225 12 T 300 12 V 24 H 0 Z" fill="rgba(15,118,110,0.35)" />
      </Svg>

      <View className="flex-row justify-between">
        <View>
          <Text className="font-sans text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Total Assets
          </Text>
          <Text className="font-sansSemi text-base text-textInverse">{formatAmount(totalAssets, isMasked)}</Text>
        </View>
        <View>
          <Text className="font-sans text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Total Liabilities
          </Text>
          <Text className="font-sansSemi text-base text-textInverse">{formatAmount(totalLiabilities, isMasked)}</Text>
        </View>
      </View>
    </View>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors attributable to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/dashboard/HeroCard.tsx
git commit -m "feat: add HeroCard net worth component"
```

---

## Task 16: Frontend — `AccountRow`

**Files:**
- Create: `frontend/components/accounts/AccountRow.tsx`

**Interfaces:**
- Produces: `<AccountRow name balance variant limit? />` — used by the Accounts screen in a later sub-project.

- [ ] **Step 1: Create `frontend/components/accounts/AccountRow.tsx`**

```tsx
import { Text, View } from 'react-native'
import { colors } from '@/constants/theme'

interface AccountRowProps {
  name: string
  balance: number
  variant: 'cash' | 'credit' | 'investment'
  limit?: number | null
}

export function AccountRow({ name, balance, variant, limit }: AccountRowProps) {
  const balanceColor = variant === 'credit' ? colors.expense : colors.textPrimary

  return (
    <View className="flex-row items-center justify-between py-3">
      <View className="flex-row items-center gap-3">
        <View className="h-8 w-8 items-center justify-center rounded-sm bg-surfaceRaised">
          <Text style={{ fontSize: 14 }}>{variant === 'investment' ? '📈' : '🏦'}</Text>
        </View>
        <Text className="font-sansMed text-base text-textPrimary">{name}</Text>
      </View>
      <View className="items-end">
        <Text className="font-mono text-base" style={{ color: balanceColor }}>
          ${balance.toFixed(2)}
        </Text>
        {variant === 'credit' && limit != null ? (
          <Text className="font-sans text-sm text-textMuted">Limit ${limit.toFixed(2)}</Text>
        ) : null}
      </View>
    </View>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors attributable to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/accounts/AccountRow.tsx
git commit -m "feat: add AccountRow"
```

---

## Task 17: Frontend — `BudgetProgressBar` and `BudgetCard`

**Files:**
- Create: `frontend/components/budgets/BudgetProgressBar.tsx`
- Create: `frontend/components/budgets/BudgetCard.tsx`

**Interfaces:**
- Produces: `<BudgetProgressBar percent />`, `<BudgetCard categoryName categoryIcon spent budget onPress? />` — used by the Budgets screen in a later sub-project.

- [ ] **Step 1: Create `frontend/components/budgets/BudgetProgressBar.tsx`**

```tsx
import { useEffect } from 'react'
import { View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { colors } from '@/constants/theme'

interface BudgetProgressBarProps {
  percent: number // 0-100+, can exceed 100
}

function barColor(percent: number): string {
  if (percent > 90) return colors.expense
  if (percent >= 70) return colors.warning
  return colors.primary
}

export function BudgetProgressBar({ percent }: BudgetProgressBarProps) {
  const width = useSharedValue(0)
  const pulse = useSharedValue(1)
  const isOver = percent > 100

  useEffect(() => {
    width.value = withTiming(Math.min(percent, 100), { duration: 500, easing: Easing.out(Easing.ease) })
  }, [percent, width])

  useEffect(() => {
    pulse.value = isOver ? withRepeat(withTiming(0.6, { duration: 700 }), -1, true) : withTiming(1)
  }, [isOver, pulse])

  const barStyle = useAnimatedStyle(() => ({ width: `${width.value}%`, opacity: pulse.value }))

  return (
    <View className="h-2 overflow-hidden rounded-full bg-border">
      <Animated.View style={[barStyle, { backgroundColor: barColor(percent) }]} />
    </View>
  )
}
```

- [ ] **Step 2: Create `frontend/components/budgets/BudgetCard.tsx`**

```tsx
import { Pressable, Text, View } from 'react-native'
import { shadow } from '@/constants/theme'
import { BudgetProgressBar } from './BudgetProgressBar'

interface BudgetCardProps {
  categoryName: string
  categoryIcon: string
  spent: number
  budget: number
  onPress?: () => void
}

function statusIcon(percent: number): string {
  if (percent > 100) return '🔴'
  if (percent >= 70) return '⚠️'
  return '✓'
}

export function BudgetCard({ categoryName, categoryIcon, spent, budget, onPress }: BudgetCardProps) {
  const percent = budget > 0 ? (spent / budget) * 100 : 0

  return (
    <Pressable onPress={onPress} className="gap-2 rounded-md bg-surface p-4" style={shadow.sm}>
      <View className="flex-row items-center gap-2">
        <Text style={{ fontSize: 18 }}>{categoryIcon}</Text>
        <Text className="font-sansSemi text-base text-textPrimary">{categoryName}</Text>
      </View>
      <Text className="font-mono text-sm text-textSecondary">
        ${spent.toFixed(2)} / ${budget.toFixed(2)}
      </Text>
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <BudgetProgressBar percent={percent} />
        </View>
        <Text className="font-sansMed text-sm text-textSecondary">{Math.round(percent)}%</Text>
        <Text>{statusIcon(percent)}</Text>
      </View>
    </Pressable>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors attributable to these two files.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/budgets/BudgetProgressBar.tsx frontend/components/budgets/BudgetCard.tsx
git commit -m "feat: add BudgetProgressBar and BudgetCard"
```

---

## Task 18: Frontend — `CalendarCell`

**Files:**
- Create: `frontend/components/transactions/CalendarCell.tsx`

**Interfaces:**
- Produces: `<CalendarCell day netAmount hasReimbursement isToday isSelected onPress />` — used by the Transactions screen's calendar view in a later sub-project.

- [ ] **Step 1: Create `frontend/components/transactions/CalendarCell.tsx`**

```tsx
import { Pressable, Text } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { colors } from '@/constants/theme'

interface CalendarCellProps {
  day: number
  netAmount: number | null // positive = net expense, negative = net income, null = no activity
  hasReimbursement: boolean
  isToday: boolean
  isSelected: boolean
  onPress: () => void
}

export function CalendarCell({ day, netAmount, hasReimbursement, isToday, isSelected, onPress }: CalendarCellProps) {
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  function handlePress() {
    scale.value = withSpring(0.95, { duration: 100 }, () => {
      scale.value = withSpring(1, { duration: 100 })
    })
    onPress()
  }

  const amountColor = netAmount == null ? colors.textMuted : netAmount < 0 ? colors.income : colors.expense

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        className="aspect-square items-center justify-center rounded-md"
        style={{
          backgroundColor: isToday ? colors.primaryMuted : isSelected ? colors.surfaceRaised : 'transparent',
          borderWidth: isSelected ? 1 : 0,
          borderColor: colors.primary,
        }}
      >
        <Text className="font-sansMed text-sm" style={{ color: isToday ? colors.primary : colors.textPrimary }}>
          {day}
        </Text>
        {netAmount != null ? (
          <Text className="font-mono text-xs" style={{ color: amountColor }}>
            {hasReimbursement ? '*' : ''}${Math.abs(netAmount).toFixed(2)}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors attributable to this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/transactions/CalendarCell.tsx
git commit -m "feat: add CalendarCell"
```

---

## Final Verification

- [ ] **Run the full backend suite:** `cd backend && npm test` — expect all tests passing, including the 2 new/modified in Tasks 1–2.
- [ ] **Run the full frontend suite:** `cd frontend && npm test` — expect all 13 `resolveFeed` tests + 2 `mmkv` tests passing.
- [ ] **Run a full frontend type-check:** `cd frontend && npx tsc --noEmit` — expect no errors.
- [ ] **Confirm no hardcoded design values slipped in:** `grep -rn "#[0-9A-Fa-f]\{3,6\}" frontend/components frontend/hooks frontend/lib | grep -v "theme.ts"` — expect no matches (all colors should route through `colors`/`hexToRgba`/NativeWind classes).
