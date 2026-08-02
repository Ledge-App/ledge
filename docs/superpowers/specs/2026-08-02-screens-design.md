# Ledge — Core Screens Implementation

> Sub-project 2 (combined, per user direction — not split into per-screen sub-projects). Builds every remaining screen in product.md's navigation tree on top of the frontend foundation (data layer + shared components) merged to `main`: Dashboard, Transactions (list + calendar + 3 sheets), Budgets, Accounts, and Settings → Categories.

Pairs with `docs/product.md`, `docs/design.md`, `docs/architecture.md`, and the foundation spec at `docs/superpowers/specs/2026-08-02-frontend-foundation-design.md`. Read those first — this spec doesn't restate their contents, only how this codebase implements them.

## Context

The foundation (merged to `main`) provides: `useTransactionFeed` (categorized/merged/reimbursement-aware feed, `spendByCategory`, `spendByDay`, `categoryById`), 8 CRUD hooks (`useCategories`, `useSubcategories`, `useBudgets`, `useVendorMappings`, `useTransactionOverrides`, `useManualTransactions`, `useReimbursements`, `useAccounts`), and 8 shared components (`CategoryCard`, `CategoryPicker`, `TransactionRow`, `HeroCard`, `AccountRow`, `BudgetProgressBar`/`BudgetCard`, `CalendarCell`, `BottomSheet`). No screen currently consumes any of this — the 4 tab screens are `ComingSoonState` placeholders, and Accounts/Categories settings screens don't exist yet.

**Routing correction**: design.md's "Accounts" screen mockup reads like a standalone top-level screen, but product.md's actual navigation tree places Accounts under Settings, not as its own tab:
```
Tab Bar: Home / Transactions / Budgets / Settings
  Settings: Plaid Developer Account / Accounts / Categories / Profile-Sign out
```
This spec follows product.md's nav tree as authoritative. Accounts is built at `app/(tabs)/settings/accounts.tsx`.

## Architecture

- **Month filtering is per-screen, client-side, no new backend calls.** Dashboard, Transactions, and Budgets each hold local `selectedMonth` state (default: current month) and derive a month-scoped view via a new pure function `filterByMonth(items, month)` in `frontend/lib/transactions/filterByMonth.ts`, applied to `useTransactionFeed`'s already-loaded `feed`. `spendByCategory`/`spendByDay` for the selected month are recomputed from the filtered feed with the same aggregation logic the foundation already uses (extracted inline per-screen via `useMemo`, not a new hook — these are cheap, screen-specific derivations, not shared state).
- **Sheets are screen-local state**, not a routing concept. Each screen that can open a sheet holds `useState` for "which sheet, with what data" and renders the sheet conditionally, passing hook mutation functions and close callbacks as props.
- **New shared components** used by 2+ screens: `MonthNavigator` (`< This Month >` control), `AccountsFilterDropdown` (the "Accounts ▾" header control on Dashboard/Transactions — filters which linked accounts' transactions are included, defaulting to "All Accounts").
- **New pure logic**: `filterByMonth.ts` (date-range filtering, unit tested) and `lib/categories/pfcOwnership.ts` (resolves which category owns each Plaid PFC code, given all categories' `plaidCategoryMappings`, unit tested) — everything else in this phase is UI composition over existing hooks/components.

## Screens

### Dashboard (`app/(tabs)/index.tsx`)

Replaces the placeholder. `AccountsFilterDropdown` + `MonthNavigator` header row. Two independently-collapsible sections (Expenses, Income), each a `FlatList numColumns={2}` of `CategoryCard`, populated from the month-filtered `spendByCategory` (categories present in that map with the matching sign convention — expense categories from positive-net entries, income from the Income category's negative-net entries). Recent transactions (last 5) and budget health cards are out of scope for this pass unless trivial — actually **in scope**: product.md §9 lists them as Dashboard features. Recent 5: last 5 `TransactionRow`s from the unfiltered (all-time) feed, tapping opens `CategorySheet`. Budget health cards: `BudgetCard`s for categories within 20% of their limit or over, from `useBudgets` + month-filtered `spendByCategory`. Piggy-bank icon renders as a disabled `Ionicons` button (v2 feature, per design.md).

### Transactions (`app/(tabs)/transactions.tsx`)

Header: `AccountsFilterDropdown`, `MonthNavigator`, list/calendar toggle (`Ionicons` list/calendar icons, local `useState` for view mode).

**List view**: transactions grouped by date (`SectionList`, section header = date + day total from `spendByDay`), each row a `TransactionRow`. FAB (`+`, bottom-right) opens `ManualTransactionSheet` in create mode. Tapping any row opens `CategorySheet` for that transaction. A filter row (date range, category, account, amount range — simple modal or inline expandable row, implementation detail left to the builder) and sort control (date/amount) apply client-side over the month-filtered feed.

**Calendar view**: month grid of `CalendarCell` (7 columns), data from month-filtered `spendByDay` plus a `hasReimbursement` flag already included there. Tapping a day sets `selectedDay` state, scrolls to and highlights that day's transactions rendered below as `TransactionRow`s. Summary bar (Income/Expenses/Net, from the month-filtered feed) sits between the grid and the transaction list.

Both views share: `CategorySheet`, `ReimbursementSheet` (opened from `CategorySheet`'s "Mark as Reimbursement" toggle, or a swipe/long-press "Add reimbursement" action on an already-categorized expense row), `ManualTransactionSheet` (create from FAB, edit by tapping a manual-sourced row — `item.source === 'manual'`). Manual transaction delete (swipe-left) prompts "This transaction is part of a reimbursement. Delete anyway?" only when `reimbursedAmount != null`, else deletes directly.

### Budgets (`app/(tabs)/budgets.tsx`)

`MonthNavigator` header. Overall progress bar: total month-filtered spend vs. sum of all budget amounts, using `BudgetProgressBar`. Below: `BudgetCard` list for every category with a budget (from `useBudgets`), sorted worst-health-first, spend from month-filtered `spendByCategory`. "No budget set" section: remaining categories (from `useCategories`) with a "Set" button that opens an inline budget-amount entry (a small bottom sheet or inline expandable row — reuses `BottomSheet` with a single amount input + period picker, calls `budgets.create`). Tapping a `BudgetCard` navigates to Transactions with that category pre-filtered (pass via router params; Transactions screen reads an optional `categoryId` param and applies it as an initial filter).

### Accounts (`app/(tabs)/settings/accounts.tsx`, new route)

Add to `settings/_layout.tsx`'s `<Stack.Screen name="accounts" options={{ title: 'Accounts' }} />` and a `SettingsRow` entry in `settings/index.tsx` linking to it. Screen: `HeroCard` (net worth = sum of asset balances − sum of liability balances, from `useAccounts`; "Total Assets"/"Total Liabilities" computed the same way), then two collapsible sections (Cash/Investment accounts, Credit accounts) of `AccountRow`, with a section-header balance total and a per-section show/hide toggle (local state, independent of `HeroCard`'s own masking). `+` button: if `usePlaidCredentials` has no saved credentials, `router.push` to `plaid-account` with an explanatory message (reuse existing pattern from onboarding's gate); otherwise launches Plaid Link directly via the existing `lib/plaid/createLinkSession` helper (already used by onboarding's `link-account.tsx`), and on success calls `plaidLink.exchangeToken` then invalidates `useAccounts`.

### Settings → Categories (`app/(tabs)/settings/categories.tsx`, new route)

Add to `settings/_layout.tsx` and a `SettingsRow` entry. List of categories (`SettingsRow`-style rows showing color swatch + icon + name), `+` in header opens create form, tapping a row opens edit form (same form, pre-filled). **Category form** (new `components/categories/CategoryForm.tsx`): name (`TextField`), color (a small preset swatch picker — reuse the `categoryColors` palette from `constants/theme.ts` as the preset options, since design.md doesn't specify a full custom color picker), icon (emoji, plain `TextField` limited to one character/emoji), and `PlaidPfcPicker` (new `components/categories/PlaidPfcPicker.tsx`): expandable-by-primary list of PFC codes with checkboxes; codes already claimed by another category (per `pfcOwnership.ts`) render disabled with a label naming the owning category. Save disabled until ≥1 PFC code selected (product.md requirement). On save: `categories.create`/`update` + `plaidCategoryMappings.create`/`update`/`delete` calls to reconcile the selected set against the category's existing mappings.

Delete: confirmation prompt with an inline category picker ("Reassign transactions to ___ or leave uncategorized?") — selecting a target category re-points affected `vendorMappings`/`transactionOverrides`... **out of scope for this pass**: bulk-reassignment of existing vendor mappings/overrides on category delete is a data-migration concern the foundation's hooks don't expose a bulk operation for yet. This pass implements the prompt UI and the simple case (leave uncategorized — i.e. just `categories.delete`, which per the backend already leaves referencing rows' `category_id` as whatever the DB allows / null where nullable); wiring actual reassignment is flagged as a known gap in the spec's Open Questions below, not silently skipped.

## Sheets

### `CategorySheet` (`components/transactions/CategorySheet.tsx`)

Drag handle, transaction header (merchant, date, account, amount), `CategoryPicker` row, subcategory row (shown once a category is selected, from `useSubcategories(categoryId)`), "Apply to all future [Vendor]?" toggle (default on, per design.md), "Mark as Reimbursement" toggle (opens `ReimbursementSheet` in place of closing, only meaningful for expense-signed items), Save button. On save (non-reimbursement path): `transactionOverrides.upsert` for this transaction, and if the "apply to future" toggle is on, `vendorMappings.upsert` with `source: 'user_defined'`.

### `ReimbursementSheet` (`components/reimbursements/ReimbursementSheet.tsx`)

Header showing the expense being reimbursed (merchant, amount). Suggested incoming-payment list: recent income-signed feed items (Plaid transfers-in + manual income) not already fully linked elsewhere, each with a "Link" button. Linked list below with remove (×) buttons. Live net-expense calculation (original − sum of linked amounts, clamped at 0 — reuses the same math `applyReimbursements` already implements, called client-side for the live preview before save). Save: one `reimbursements.create` call per linked income transaction (the schema is one reimbursement row per expense↔income pair, so linking 2 incomes = 2 create calls).

### `ManualTransactionSheet` (`components/transactions/ManualTransactionSheet.tsx`)

Expense/Income `SegmentedControl`, large amount input (display font, colored by type), `CategoryPicker` + subcategory, date picker (iOS native picker), note field. Create mode: "Save Transaction" → `manualTransactions.create`. Edit mode (opened from an existing manual row): pre-filled, "Save Transaction" → `manualTransactions.update`, plus a "Delete Transaction" link (rose text) with the reimbursement-aware confirmation described under Transactions above.

## Error handling

- Screen-level query errors (from any of the composed hooks) render via the existing `ErrorBanner` at the top of the screen, dismissible.
- Sheet-level validation (e.g. no category selected, amount empty/zero) disables the Save button rather than showing an error banner — consistent with the existing `SecretInput`/`TextField` pattern of inline, non-modal feedback.
- Plaid Link failures (Accounts screen `+` button) surface via `ErrorBanner`, mirroring the existing pattern in `onboarding/link-account.tsx`.

## Testing

- Unit tests (Vitest) for the two new pure functions: `filterByMonth.ts` (boundary dates, timezone-naive `YYYY-MM-DD` string comparison consistent with how dates are already stored) and `pfcOwnership.ts` (correct category attribution, no-owner case).
- No component/screen unit tests, per the established convention — manual verification via the `run` skill (launching the Expo iOS simulator) once each screen is implemented, clicking through the golden path and a couple of edge cases (empty states, a reimbursed transaction, an over-budget category). If the sandbox can't launch a simulator, this will be stated explicitly rather than claimed as verified.

## Out of scope (this sub-project)

- Bulk reassignment of `vendorMappings`/`transactionOverrides` when a category is deleted (see Settings → Categories section above) — the prompt UI ships, the actual bulk-reassignment backend call does not exist yet.
- A custom (non-preset) color picker for categories — presets from `constants/theme.ts`'s `categoryColors` only.
- Push notifications for budget thresholds (product.md §7, marked "optional").
- Net worth history chart (design.md explicitly marks this "out of scope v1 — show disabled state").
- CSV export, receipt scanning, bill-splitting math, Android — all explicitly out of scope per product.md.
- A global privacy/masking context — each screen's own local masking (Accounts' section toggles, `HeroCard`'s own toggle) is independent, no shared state, per the foundation's earlier deferral of a global context.

## Decided during self-review

- Category deletion's transaction-reassignment: this spec ships the confirmation UI but not bulk-reassignment logic (no backend endpoint exists for "move all vendor_mappings/transaction_overrides from category A to category B" as one call, and adding one is out of scope for this UI-focused pass). Decision: this pass ships "leave uncategorized" only — the delete confirmation shows the category picker per design.md's mockup, but selecting a target category is disabled with a "Coming soon" label, and only the plain delete (no reassignment) path is wired to `categories.delete`. A working reassignment endpoint is a follow-up, not part of this sub-project.
