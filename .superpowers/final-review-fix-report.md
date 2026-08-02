# Final whole-branch review — fix report

Branch: `main` (worked directly in `/Users/qihongwu/VSCode/ledger`)

## Commits

| Hash | Fixes | Summary |
| --- | --- | --- |
| `2136da3` | 1, 2 | Gate category form on loaded data; confirm category deletion |
| `a145cf2` | 3 | Honor the `categoryId` nav param from Budgets |
| `6a05060` | 4, 5 | One shared month aggregator for all screens |
| `40b316c` | 6 | Source reimbursement income candidates from the full feed |
| `483747f` | 7 | Loading and empty states on the main screens |

---

## Fix 1 (Critical) — Editing a category could silently wipe its Plaid PFC mappings

`CategoryForm` seeds all of its state (`name`, `color`, `icon`, `selectedCodes`) from props
through once-only `useState` initializers. The screen mounted it before
`categories.list` and `plaidCategoryMappings.list` had resolved, so on a cold mount
`selectedCodes` locked in as an empty set, the checkbox UI never caught up, and saving
deleted every real mapping for that category.

Changed `frontend/app/(tabs)/settings/category-form.tsx` only — an early
`if (categories.isLoading || mappings.isLoading) return <LoadingScreen />` placed after all
hooks. `CategoryForm.tsx` itself is untouched: its once-only initialization is correct as
long as the parent doesn't mount it before data is ready. This also fixes the same latent
race for `name`/`color`/`icon` on a cold deep-link to `/settings/category-form?id=…`.

## Fix 2 (Important) — Category deletion had no confirmation

`handleDelete` in `frontend/app/(tabs)/settings/category-form.tsx` now opens a React Native
`Alert` with Cancel / destructive Delete, mirroring the manual-transaction delete pattern in
`transactions.tsx`. The delete call and error handling moved into the `onPress` handler; the
function is no longer `async` since it now only presents the alert.

## Fix 3 (Important) — Budgets→Transactions `categoryId` param was a dead no-op

In `frontend/app/(tabs)/transactions.tsx`:

- read the param via `useLocalSearchParams<{ categoryId?: string }>()` and seed
  `categoryFilter` state from it;
- added `filteredFeed`, the account+month `monthFeed` further narrowed by `categoryFilter`;
- every downstream consumer now reads `filteredFeed`: `sections`, the day aggregates, the
  summary bar and `selectedDayItems`. `monthFeed` remains the account+month stage;
- added a dismissible chip below the header showing
  `categoryById.get(categoryFilter)?.name` with an `×` that clears the filter.

## Fix 4 + 5 (Important) — Aggregation drift, and dead/buggy aggregates in the shared hook

Dashboard and Budgets classified by *gross* amount sign and dropped uncategorized items from
the expense total; the Transactions calendar classified by *net* sign and included them — so
the same month could show two different "Expenses" figures. `useTransactionFeed` already
exported `spendByCategory`/`spendByDay` as the intended single source of truth, but no screen
used them, and its `spendByCategory` was missing the `isReimbursementIncome` exclusion all
three screens had independently added.

New `frontend/lib/transactions/aggregateMonth.ts` exports `aggregateMonth(feed)` returning
`{ spendByCategory, incomeByCategory, spendByDay, totalExpense, totalIncome }`. Two
conventions are now fixed and documented in the file:

- classify by **net** sign (post-reimbursement), matching the calendar's prior behavior;
- uncategorized items **do** count toward `totalExpense`/`totalIncome` and are excluded only
  from the per-category maps — a running total that silently drops uncategorized spend
  understates real spending. This deliberately differs from the old Dashboard behavior.

Call sites converted:

- `frontend/hooks/useTransactionFeed.ts` — inline `spendByCategory`/`spendByDay` memos
  replaced by one `aggregateMonth(feed)` memo; public return shape and keys unchanged.
- `frontend/app/(tabs)/index.tsx` — `spendByCategory`/`incomeTotals`/`totalExpenses`/
  `totalIncome` memos replaced by one destructured `aggregateMonth(monthFeed)`; the income
  card grid now iterates `incomeByCategory`. JSX structure unchanged.
- `frontend/app/(tabs)/budgets.tsx` — local `spendByCategory` memo replaced;
  `budgetedRows`, `unbudgetedCategories` and the budgeted-only `totalSpent` are untouched.
- `frontend/app/(tabs)/transactions.tsx` — `monthSummary` and `spendByDayFiltered` replaced
  by one `aggregateMonth(filteredFeed)` (the category-filtered feed from Fix 3, so calendar
  and summary reflect the active filter). Net is rendered as `totalIncome - totalExpense`,
  matching the previous `monthSummary.net`.

New test `frontend/lib/transactions/aggregateMonth.test.ts` (6 tests) covers: mixed
categorized/uncategorized/reimbursed items netting into the totals; uncategorized items in
totals but absent from the per-category maps; multi-item per-category summing;
`isReimbursementIncome` excluded from every total and from the day `net` while still setting
`hasReimbursement`; day accumulation with untouched days absent; the empty-feed case.

## Fix 6 (Important) — Inconsistent reimbursement candidates, no exclusion of linked income

Dashboard sourced candidates from the account-filtered feed, Transactions from the raw feed.
Account filtering is wrong here — a reimbursement's income leg usually lands on a different
account than the expense. Neither excluded income already linked elsewhere, permitting
double-linking. Both `index.tsx` and `transactions.tsx` now use the identical filter:

```ts
feed.filter((item) => item.amount < 0 && item.id !== reimbursementItem?.id && !item.isReimbursementIncome)
```

## Fix 7 (Important) — No loading or empty states

New `frontend/components/ui/EmptyState.tsx` (`{ message, actionLabel?, onAction? }`) — added
because the same centered message-plus-optional-CTA block was needed on four screens.

- **Loading**: `index.tsx`, `transactions.tsx` and `budgets.tsx` each early-return
  `<LoadingScreen />` when loading. Every early return is placed after all hook calls.
  Budgets additionally now destructures `isLoading` from `useTransactionFeed` (it previously
  did not) and also waits on `budgets.isLoading`.
- **Transactions**: `filteredFeed.length === 0` renders "No transactions this month"
  (design.md's exact copy) in place of the section list / calendar.
- **Dashboard**: zero accounts (once accounts have loaded) renders
  "Link an account in Settings to see your spending here."
- **Budgets**: zero categories renders
  "No categories yet — add one in Settings → Categories to start budgeting."
- **Accounts** (`settings/accounts.tsx`): zero accounts and credentials loaded renders the
  full-screen prompt design.md specifies — "Connect your Plaid developer account to get
  started" with a CTA routing to `/(tabs)/settings/plaid-account` when `!credentials.data`,
  otherwise "Link your first account to get started" with a CTA invoking the existing
  `handleAddAccount` Plaid Link flow.

---

## Verification

```
cd /Users/qihongwu/VSCode/ledger/frontend && npx tsc --noEmit
```
Clean — zero errors, no output.

```
cd /Users/qihongwu/VSCode/ledger/frontend && npx vitest run
```
```
 ✓ lib/categories/pfcOwnership.test.ts (3 tests)
 ✓ lib/transactions/aggregateMonth.test.ts (6 tests)
 ✓ lib/storage/mmkv.test.ts (2 tests)
 ✓ lib/transactions/resolveFeed.test.ts (18 tests)
 ✓ lib/transactions/filterByMonth.test.ts (6 tests)

 Test Files  5 passed (5)
      Tests  35 passed (35)
```

Both commands were run after the final commit; the `frontend/` working tree is clean.

## Fix 8 (Important) — Category filter from route param not re-applied on tab re-entry

Fix 3 seeded `categoryFilter` state from the `categoryId` route param via `useState`
initializer. However, Expo Router's bottom tabs stay mounted after first visit, so on
subsequent navigation to Transactions (tab already mounted), `useLocalSearchParams`
returns the new param, but `useState` initializer never re-runs — the filter silently
fails to apply.

Added a `useEffect` in `frontend/app/(tabs)/transactions.tsx` that syncs `categoryFilter`
to `categoryIdParam` whenever the param changes:

```ts
useEffect(() => {
  setCategoryFilter(categoryIdParam ?? null)
}, [categoryIdParam])
```

Placed near the existing `selectedDay` reset effect (line ~69).

## Notes

- Fix 4+5 is a pure data-layer refactor: no JSX structure changed on any of the four screens,
  only the source of the numbers fed into it.
- The Fix 4+5 convention change (uncategorized items now counted in Dashboard's Expenses /
  Income headline totals) is an intentional user-visible behavior change, made to pick one
  consistent convention across screens.
- On Transactions, the empty state replaces the calendar as well as the list for an empty
  month, per the fix brief's "in place of the normal SectionList/calendar content".
- Fix 8 completes Fix 3's category filtering by handling the re-mounting case where the
  route param changes after the Transactions tab has already been mounted once.

## Re-review outcome (final round)
Findings 1,2,4+5,6,7 fully ADDRESSED and verified (aggregateMonth logic traced by hand across categorized/uncategorized/reimbursed/fully-reimbursed cases; consumption confirmed in all 4 call sites with no parallel implementations surviving). Finding 3 was partially addressed (worked on first tab mount, not on repeat navigation) — fixed with one more commit (99a1096) syncing categoryFilter via useEffect on categoryIdParam change.

Deferred (not blocking, logged for awareness):
- isLoading now triggers a full-screen LoadingScreen blank on every background resync (not just first load), since useTransactionFeed's isLoading includes the sync mutation's in-flight state. Not currently user-facing since no pull-to-refresh/RefreshControl exists anywhere in the app yet. Should gate on `feed.length === 0 && isLoading` instead when pull-to-refresh is added.
- Transactions "No transactions this month" empty-state copy also shows when a category filter yields zero rows in an otherwise non-empty month (cosmetic wording, not incorrect).
- Dashboard headline total (aggregateMonth's totalExpense, includes uncategorized items) intentionally no longer reconciles exactly with the sum of visible category cards (which only show categorized spend) — a deliberate convention choice from the aggregation refactor.

Core screens plan (all 18 tasks) is complete, merged to main, and ready to finish.
