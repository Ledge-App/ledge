# Wave 4a Fix Report

Branch: `main` (repo `/Users/qihongwu/VSCode/ledger`)

## Fixes

1. **Dashboard recategorization no-op (index.tsx)** — Recent-transaction rows now pass
   `onPress` only when `item.source === 'plaid'`; manual rows get `undefined` (TransactionRow's
   `onPress` is optional), so no sheet opens whose save would silently do nothing.
2. **Income double-count (index.tsx)** — `incomeTotals` skip condition now
   `if (item.amount >= 0 || !item.categoryId || item.isReimbursementIncome) continue`, matching
   `spendByCategory`.
3. **Nested FlatList (index.tsx)** — Both Expenses and Income grids replaced with
   `<View className="flex-row flex-wrap gap-3">` + `.map()`, each card wrapped in
   `<View key={category.id} className="w-[48%]">`. `FlatList` import removed.
4. **Account filter scope (index.tsx)** — `recentTransactions` and `candidateIncomeItems` now read
   `accountFilteredFeed` instead of raw `feed`.
5. **Delete confirmation (transactions.tsx)** — `handleDeleteManual` looks up the feed item by id,
   computes `isReimbursed` from `reimbursedAmount != null || isReimbursementIncome === true`, and
   shows `Alert.alert` with the reimbursement-specific title when applicable, deleting only from the
   destructive action. `Alert` imported from `react-native`.
6. **Day totals (transactions.tsx)** — Section total is now
   `items.reduce((sum, i) => (i.isReimbursementIncome ? sum : sum + (i.netAmount ?? i.amount)), 0)`.
7. **Overall progress (budgets.tsx)** — `totalSpent` now sums only budgeted categories:
   `(budgets.data ?? []).reduce((sum, b) => sum + (spendByCategory.get(b.categoryId) ?? 0), 0)`.
8. **Budget amount validation (budgets.tsx)** — Added
   `const isValidAmount = /^\d+(\.\d{1,2})?$/.test(newAmount) && Number(newAmount) > 0`, used as both
   the `handleSetBudget` guard and the Save button's `disabled` condition.
9. **accounts.list invalidation (settings/accounts.tsx)** — Replaced the no-op
   `accounts.data && (await Promise.resolve())` with `await utils.accounts.list.invalidate()`;
   added `const utils = api.useUtils()` and the `api` import.
10. **Loan accounts as liabilities (settings/accounts.tsx)** — `isCreditAccount` replaced by
    `isLiabilityAccount` (`type === 'credit' || type === 'loan'`), used for both the
    cash/credit split and the asset/liability sums. Section header and `variant="credit"` unchanged.
11. **Credentials loading guard (settings/accounts.tsx)** — `handleAddAccount` early-returns on
    `credentials.isLoading`, and the "+" Pressable is `disabled` while loading.
12. **Unhandled mutation rejections** — Added `saveError` state + `<ErrorBanner ... onDismiss>`
    (rendered alongside, not replacing, existing query-error banners) in index.tsx,
    transactions.tsx, and budgets.tsx. Handlers converted to `async` with `await` + `try/catch`:
    `handleSaveCategory`, `handleOpenReimbursement`, `handleSaveReimbursement` (both index and
    transactions), `handleSaveManual`, the delete path of `handleDeleteManual`, and
    `handleSetBudget`. accounts.tsx already had try/catch around `exchangeToken` with its own
    `error`/`setError` state — confirmed sufficient, the new `invalidate()` call sits inside it.

`frontend/hooks/usePlaidLink.ts` was read for context but needed no change (invalidation handled at
the call site per Fix 9).

## Verification

```
cd /Users/qihongwu/VSCode/ledger/frontend && npx tsc --noEmit
# no output — zero errors

cd /Users/qihongwu/VSCode/ledger/frontend && npx vitest run
#  Test Files  4 passed (4)
#       Tests  29 passed (29)
```

## Commits

- `078371e` fix(dashboard): correct income totals, account filtering, list nesting, and mutation error surfacing
- `4d673cc` fix(transactions): add delete confirmation, reimbursement-aware day totals, mutation error surfacing
- `f0a317b` fix(budgets,accounts): overall spend scope, amount validation, loan liabilities, account invalidation

## Re-review outcome
All 12 findings ADDRESSED, verified clean by independent re-review. Minor deferred (not blocking):
- Dashboard: manual-transaction recent-transaction rows are now tap-inert (no sheet, no navigation) rather than routed to the Transactions screen's ManualTransactionSheet.
- Dashboard: 2-col category grid (w-[48%] + gap-3) could collapse to one column on very narrow devices (<~300pt content width).
- Budgets: no unique constraint on budgets(user_id, category_id) — duplicate budgets per category would double-count in totalSpent (currently unreachable via UI, no "add another budget for this category" path exists).
- Accounts: loan accounts render under "CREDIT ACCOUNTS" header with variant="credit" (limit falls back to null) — correct math, cosmetic grouping only.

Wave 4a (Tasks 12,13,15,16) is complete and merged to main.
