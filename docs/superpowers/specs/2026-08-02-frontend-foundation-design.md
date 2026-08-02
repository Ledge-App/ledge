# Frontend Foundation — Data Layer + Shared Components

> Sub-project 1 of "implement the core app screens" (Dashboard, Accounts, Transactions, Budgets, Categories settings). This spec covers only the shared foundation those screens will be built on: the client-side transaction engine and the reusable visual components. It does not implement any screen.

Pairs with `docs/product.md`, `docs/design.md`, `docs/architecture.md`. Read those first — this spec doesn't restate their contents, only how this codebase implements them.

## Context

`frontend/` already has auth, onboarding, and the BYOK Plaid-credentials screen fully built (`app/(auth)`, `app/onboarding`, `app/(tabs)/settings/plaid-account.tsx`), following an established pattern: hooks wrap `api.<router>.<procedure>.useQuery/useMutation` (see `hooks/usePlaidCredentials.ts`), components are plain RN + NativeWind pulling tokens only from `constants/theme.ts`, and `lib/api/client.ts` is the one tRPC client instance.

The backend (`backend/src/routers/*`) already implements every router this spec's hooks will call: `categories`, `subcategories`, `transactions.sync`, `accounts.list`, `budgets` (including `spendCalculations`), `vendorMappings`, `transactionOverrides`, `manualTransactions`, `reimbursements` (including `netExpense`). No backend changes are in scope here.

Four screens (Dashboard, Accounts, Transactions, Budgets) and Settings→Categories all need the same underlying data (a categorized transaction feed, budget progress, category list) and the same signature components (CategoryCard, TransactionRow, bottom sheets). Building this once, shared, avoids four divergent implementations.

## Architecture

**Compute-on-read, no persisted derived state.**

- MMKV stores only the raw cache the architecture doc calls for: per-Plaid-item, the last-synced transaction array and the sync cursor. Nothing else is persisted on-device.
- Categories, subcategories, budgets, vendor mappings, transaction overrides, manual transactions, and reimbursements all come from react-query via the existing `api` client — no MMKV involved, since they're small, server-persisted, and react-query's in-memory cache is sufficient.
- A pure function module resolves the final display feed (category per transaction, merged Plaid + manual rows, reimbursement net amounts) fresh on every read, from whatever the hooks currently hold. No separate resolved-cache to invalidate.

Rejected alternatives: persisting the resolved/merged feed (adds an invalidation surface with no benefit at this data scale — one user, a few thousand transactions); a normalized store with memoized selectors (same rejection — added machinery for a problem that doesn't exist yet at this scale).

## Data layer

### `lib/storage/mmkv.ts`

Thin wrapper over an MMKV instance:

```ts
getCachedTransactions(itemId: string): PlaidTransaction[]
setCachedTransactions(itemId: string, txns: PlaidTransaction[]): void
getCursor(itemId: string): string | undefined
setCursor(itemId: string, cursor: string): void
```

### `lib/transactions/resolveFeed.ts`

Pure, no side effects, fully unit-testable:

- `resolveCategory(txn, overrides, vendorMappings): { categoryId, subcategoryId, source: 'override' | 'user_defined' | 'plaid_auto' | 'uncategorized' }` — implements the 4-step priority order from product.md §2 (transaction_overrides → user_defined vendor_mappings → plaid_auto vendor_mappings → Uncategorized fallback).
- `mergeFeed(plaidTxns, manualTxns, categoryMap): FeedItem[]` — one array, sorted date descending, each item tagged `source: 'plaid' | 'manual'` so `TransactionRow` picks the right visual variant (pencil badge for manual, account logo for Plaid).
- `applyReimbursements(feed, reimbursements): FeedItem[]` — attaches net amount and reimbursed-badge data (full/partial) to any row that's the expense side of a reimbursement link; tags reimbursement-income rows with the violet variant.

### Hooks (`hooks/`)

All follow the existing `usePlaidCredentials` shape — thin wrapper around react-query, returns `{ data, isLoading, error, ...mutations }`, mutations invalidate their own query on success:

- `useCategories`, `useSubcategories`, `useBudgets`, `useVendorMappings`, `useTransactionOverrides`, `useManualTransactions`, `useReimbursements`, `useAccounts` — one hook per backend router, CRUD passthrough.
- `useTransactionFeed` — the orchestrator:
  1. Reads cursors from MMKV for each linked Plaid item (item list from `useAccounts` or a lightweight `plaidItems` list — see Open Questions).
  2. Calls `transactions.sync` per item. On success, appends new transactions to the MMKV raw cache and persists the new cursor.
  3. Per-item failures are caught individually — a failure on one item does not block others from syncing or merging (architecture.md's BYOK isolation: one user's Plaid misconfig only breaks their own sync, never surfaced as a global failure). Failed items surface a non-blocking inline warning the caller can render.
  4. Calls `resolveFeed.ts`'s three functions with the merged raw cache + `useManualTransactions` + `useTransactionOverrides` + `useVendorMappings` + `useCategories` + `useReimbursements` data.
  5. Returns the final sorted feed, plus per-category and per-day spend aggregates (needed by Dashboard's card grid, Budgets' progress bars, and the Transactions calendar view) computed from the same feed so all three screens see identical numbers.

## Shared components (`components/`)

Take resolved data as props only — no hooks, no service calls, per the architecture doc's Components → Hooks one-way dependency rule. This makes them usable in isolation and testable with fixture data.

- `components/ui/BottomSheet.tsx` — generic sheet primitive: drag handle, spring slide-up (damping 20, stiffness 180 per design.md), focus trap while open. Base for the category sheet, reimbursement sheet, and add/edit manual transaction sheet (built in later sub-projects, not this one).
- `components/categories/CategoryCard.tsx` — arc-ring card (`react-native-svg` ring, `react-native-reanimated` fill animation 0→budget% over 600ms easeOut). Dashed ring + "Set budget" label when no budget set (per design.md empty state).
- `components/categories/CategoryPicker.tsx` — scrollable category-icon grid row, shared by future transaction-detail and add-manual-transaction sheets.
- `components/transactions/TransactionRow.tsx` — all four row variants (Plaid, manual/pencil-badge, reimbursement/violet, partial-reimbursement `[$X → $Y]` badge).
- `components/dashboard/HeroCard.tsx` — teal gradient net-worth card, wave SVG, its own loading skeleton independent of the rest of the screen (per design.md — balances are fetched live, never cached server-side).
- `components/accounts/AccountRow.tsx` — cash/investment variant (textPrimary balance) vs. credit variant (expense-color balance + textMuted limit).
- `components/budgets/BudgetCard.tsx` + `BudgetProgressBar.tsx` — teal/amber/rose by %, pulse animation when over 100%.
- `components/transactions/CalendarCell.tsx` — today/selected/has-spend/has-income-only/empty states per design.md.

Privacy masking (`$****`) is explicitly **out of scope** for this sub-project per user decision — components render real amounts; a follow-up sub-project adds a masking context later.

## Error handling

- Each hook surfaces react-query's `{ error }` unchanged; screens render it via the existing `ErrorBanner` component — no new error pattern introduced.
- `useTransactionFeed` never throws for a single failed item's sync; it collects per-item failures into a `syncErrors: { itemId, error }[]` array alongside the successfully-merged feed, so screens can show a non-blocking warning without losing data from healthy items.

## Testing

- Vitest unit tests (matching the backend's existing convention) for the pure logic only:
  - `resolveFeed.test.ts` — category resolution priority order (all 4 branches), merge/sort correctness across Plaid+manual, reimbursement net-amount math (full and partial), manual-transaction source tagging.
  - `mmkv.test.ts` — cursor and raw-transaction cache round-trip.
- No component/snapshot tests. Shared components get manual visual verification later (via the `run` skill) once a screen sub-project actually consumes them — there's nothing to visually verify in isolation yet.

## Out of scope (this sub-project)

- Any screen (Dashboard, Accounts, Transactions, Budgets, Settings→Categories) — built in later sub-projects consuming this foundation.
- Privacy/masking context.
- Backend changes, with one confirmed exception (see below) — every other router this spec's hooks call already exists as-is.
- `PlaidPfcPicker` and category-CRUD-specific components — belong to the Settings→Categories sub-project.

## Confirmed backend change

Checked `backend/src/repositories/accountRepository.ts` and `plaidItemRepository.ts`: `accounts.list` currently returns each Plaid account merged with only `institutionName`, no per-item ID. `useTransactionFeed` needs a stable item ID per linked item to key the MMKV raw-transaction cache and cursor. Fix: in `backend/src/routers/accounts.ts`, include `item.itemId` (already returned by `plaidItemRepository.listDecryptedTokens`) alongside `institutionName` when building each result row — a one-line addition, no schema or migration change.
