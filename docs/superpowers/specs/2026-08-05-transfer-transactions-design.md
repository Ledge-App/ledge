# Transfer Transactions

**Date:** 2026-08-05
**Branch:** `qw-232-allow-transfer-accounts`

## Problem

A transfer between the user's own accounts appears twice in the feed: once as an expense on the source
account and once as income on the destination account. Both count toward totals, so a $500 move from
checking to savings inflates monthly spending by $500 and monthly income by $500. Credit card payments
have the same shape and the same effect.

The app has no notion of a transfer today. `Transfers In` / `Transfers Out` exist only as seeded Plaid
categories (`backend/src/lib/plaid/pfc.ts:195-224`) and still count fully toward totals.

## Solution

Let the user open an expense, mark it as a transfer, choose a transfer type, and link the matching
income transaction. Both legs keep their place in the feed with a badge but drop out of every total.
An expense can be marked as a transfer even when no matching income exists — common when the
destination account is not connected to the app.

## Key constraint

Plaid transactions are never persisted server-side. `transactionsRouter.sync`
(`backend/src/routers/transactions.ts:6`) is a pure relay over `transactionSyncService.sync`
(`backend/src/services/transactionSyncService.ts:21-54`); raw transactions live only in device MMKV
(`frontend/lib/storage/mmkv.ts`).

The backend therefore cannot search for candidate income legs. Candidate matching runs client-side.
This splits the transfer-type abstraction into a backend kind list (validation, persistence) and a
frontend behavior registry (matching, presentation).

## Decisions

| Question | Decision |
|---|---|
| Candidate matching | Amount within 5%, date within ±7 days of the expense |
| No matching income | Allowed. The expense is flagged and excluded from totals with no income leg |
| Display | Both legs stay visible with a "Transfer" badge; excluded from all totals |
| Categories | Untouched. Marking a transfer does not write a category override |
| Data model | New `transfers` table, mirroring `reimbursements` |
| Entry points | Plaid `CategorySheet` and manual `ManualTransactionSheet` (edit mode) |

Rejected: adding a `kind` column to `reimbursements` (forces relaxing `income_xor` for all rows and
conflates two concepts); an `is_transfer` flag on `transaction_overrides` (keyed by
`plaid_transaction_id`, so manual transactions could not be marked, and there is nowhere to store the
pairing).

## Transfer type interface

### Backend: kind list

`backend/src/lib/transfers/kinds.ts` is the source of truth for which kinds exist.

```ts
export const TRANSFER_KINDS = ['account_transfer', 'credit_card_payment'] as const
export type TransferKind = (typeof TRANSFER_KINDS)[number]
```

The router validates with `z.enum(TRANSFER_KINDS)`. The `kind` column is `text` with a CHECK
constraint against the same list.

### Frontend: behavior registry

`frontend/lib/transfers/registry.ts` defines what each kind *does*.

```ts
export interface TransferTypeDefinition {
  kind: TransferKind
  label: string                  // chip text and row badge, e.g. "Credit card payment"
  description: string            // one-line explainer shown under the chips
  icon: IoniconName
  color: string                  // from constants/theme
  appliesTo(expense: FeedItem, ctx: TransferContext): boolean
  matches(expense: FeedItem, candidate: FeedItem, ctx: TransferContext): boolean
  allowsUnpaired: boolean
}

export interface TransferContext { accounts: Account[] }

export const TRANSFER_TYPES: Record<TransferKind, TransferTypeDefinition> = { ... }
```

`Record<TransferKind, TransferTypeDefinition>` is the enforcement mechanism: adding a kind to
`TRANSFER_KINDS` fails to compile until a full definition exists. That is the contract every new
transfer type implements.

Composable predicates live beside the registry so a new type is composition, not new logic:
`amountWithinTolerance(pct)`, `withinDays(n)`, `differentAccount`, `onLiabilityAccount`.

`amountWithinTolerance(0.05)` compares absolute values and takes the tolerance as a fraction of the
expense amount: `Math.abs(Math.abs(candidate.amount) - expense.amount) <= expense.amount * 0.05`.
`withinDays(7)` compares calendar dates inclusively, so a candidate exactly 7 days away matches.

### Initial types

| kind | `appliesTo` | `matches` |
|---|---|---|
| `account_transfer` | any expense | income leg, amount within 5%, date within ±7 days, different account |
| `credit_card_payment` | any expense | same, plus the income leg must land on a credit/liability account |

`allowsUnpaired` is `true` for both.

Manual transactions have `accountId: null` (`resolveFeed.ts:101`). `differentAccount` treats a null
account as different from any account, so manual items are never filtered out by it.
`onLiabilityAccount` returns `false` for a null account, so manual income is not a credit card payment
counterparty.

`isLiabilityAccount` is currently duplicated at `frontend/app/(tabs)/accounts.tsx:22-28` and
`frontend/app/(tabs)/settings/accounts.tsx:21-27`. Extract it to
`frontend/lib/accounts/accountType.ts` alongside `isInvestmentAccount` and have both screens and the
registry import from there.

## Data model

New `transfers` table in `backend/src/lib/db/schema.ts`, mirroring `reimbursements` (`schema.ts:117`)
but with a nullable income leg.

```ts
export const transfers = pgTable('transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  kind: text('kind').notNull(),
  expensePlaidTransactionId: text('expense_plaid_transaction_id'),
  expenseManualTransactionId: uuid('expense_manual_transaction_id').references(() => manualTransactions.id),
  incomePlaidTransactionId: text('income_plaid_transaction_id'),
  incomeManualTransactionId: uuid('income_manual_transaction_id').references(() => manualTransactions.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

Constraints:

- `expense_xor` — exactly one expense leg set (same as `reimbursements`).
- `income_not_both` — at most one income leg set: `NOT (income_plaid IS NOT NULL AND income_manual IS NOT NULL)`. Both null means unpaired.
- `kind_valid` — `kind IN ('account_transfer', 'credit_card_payment')`.
- Partial unique indexes on `(user_id, expense_plaid_transaction_id)`, `(user_id, expense_manual_transaction_id)`, `(user_id, income_plaid_transaction_id)`, `(user_id, income_manual_transaction_id)`, each `WHERE <column> IS NOT NULL`, so no transaction is linked into two transfers.

`amount` stores the expense leg amount for display without needing the transaction loaded.

A new migration adds the table plus its own `auth.uid() = user_id` FOR ALL RLS policy. The blanket
policy in `backend/drizzle/0001_enable_rls_user_scoped_tables.sql:57` only covers tables that existed
when it was written.

## Backend surface

Mirrors reimbursements. No service layer — there is nothing to compute server-side.

- `backend/src/repositories/transferRepository.ts` — `list`, `create`, `delete`, using `getScopedClient(jwt)` and the `fromRow` / `COLUMNS` convention. `create` validates the expense XOR and the income at-most-one rule before insert, matching `reimbursementRepository.create`.
- `backend/src/routers/transfers.ts` — `list` (query), `create` (mutation), `delete` (mutation), all `protectedProcedure` with zod input.
- Registered in `backend/src/trpc/router.ts`.

## Feed decoration and totals

`FeedItem` (`frontend/lib/transactions/resolveFeed.ts:40`) gains:

```ts
transferId: string | null
transferKind: TransferKind | null
transferRole: 'expense' | 'income' | null
```

All three default to `null` in both the Plaid and manual branches of `mergeFeed`.

New `applyTransfers(feed, transfers)` in `resolveFeed.ts` builds an id→transfer map for expense legs
and another for income legs, then stamps each matching item. It runs immediately after
`applyReimbursements` in `frontend/hooks/useTransactionFeed.ts:104`.

### Exclusion

The check currently written as `if (item.isReimbursementIncome) continue` in five places becomes one
shared predicate:

```ts
// frontend/lib/transactions/totals.ts
export function countsTowardTotals(item: FeedItem): boolean {
  return !item.isReimbursementIncome && item.transferKind === null
}
```

Call sites to update:

- `frontend/lib/transactions/aggregateMonth.ts:35`
- `frontend/lib/transactions/visualizationData.ts:31` (`computeDonutSegments`)
- `frontend/lib/transactions/visualizationData.ts:88` (`computeTopMerchants`)
- `frontend/lib/transactions/visualizationData.ts:112` (`computeDailyPoints`)
- `frontend/app/(tabs)/transactions.tsx:326-327` (inline per-day IN/OUT rows)

Both legs are excluded whether or not the transfer is paired. This covers `totalExpense`,
`totalIncome`, `spendByCategory`, `incomeByCategory`, `spendByDay`, the donut, top merchants, the
daily chart, and budget progress (which reads `aggregateMonth` output at
`frontend/app/(tabs)/budgets.tsx:37,56`).

Account balances and net worth are unaffected. They come from Plaid directly
(`frontend/app/(tabs)/accounts.tsx:43-47`), and a transfer does genuinely move money between accounts.

## UI

### Entry points

**Plaid transactions.** `CategorySheet` gains a third `Switch`, "Mark as Transfer", below "Mark as
Reimbursement" (`frontend/components/transactions/CategorySheet.tsx:96`). The two switches are
mutually exclusive — turning one on turns the other off. `handleSave` (`:41`) gains a branch calling a
new `onOpenTransfer` prop, parallel to the existing `onOpenReimbursement` branch.

**Manual transactions.** `ManualTransactionSheet` gains the same switch, shown only when editing an
existing transaction whose type is `expense`. It is hidden on create (there is no transaction id to
link yet) and hidden for income. Saving with it on persists the edit first, then opens `TransferSheet`
with the saved manual expense as the leg.

Both entry points are wired in `frontend/app/(tabs)/transactions.tsx`, which already dispatches
row presses to the manual edit sheet or the category sheet at `:209-224`.

### TransferSheet

`frontend/components/transfers/TransferSheet.tsx`, modeled on
`frontend/components/reimbursements/ReimbursementSheet.tsx`.

Props: `visible`, `expenseItem: FeedItem | null`, `candidateIncomeItems: FeedItem[]`, `accounts`,
`onClose`, `onSave(input: { kind: TransferKind; incomeItemId: string | null })`.

Layout:

- Header "Transfer" with a close button, expense merchant and amount beneath it.
- A row of type chips built by iterating `TRANSFER_TYPES` and filtering by `appliesTo`. Defaults to the first applicable type. The selected type's `description` renders below the chips.
- Candidate list: income items passing the selected type's `matches()`, excluding any already linked to another transfer, sorted by date distance then amount distance. Changing the chip re-filters live.
- Single-select. A transfer has one counterparty, unlike a reimbursement which can have several.
- Empty state: "No matching income found within a week." The save button stays enabled and reads "Save without match".
- Save calls the `transfers.create` mutation and invalidates, following the `useTransactionOverrides` hook pattern (`useQuery` + mutations with `utils.transfers.list.invalidate()` on success).

Local state resets in a `useEffect` on `expenseItem?.id`, since the parent keeps one persistent
instance and only toggles `visible` (the pattern at `CategorySheet.tsx:28-35`).

### Row display

`frontend/components/transactions/TransactionRow.tsx` renders a badge showing the transfer type's
`label` and applies muted styling to both legs, following the reimbursement special-casing at `:18-24`
and `:34-38`. Showing the label rather than a generic "Transfer" means a credit card payment reads as
one.

### Unmarking

Reopening a transfer leg's sheet shows "Mark as Transfer" already on. Turning it off and saving calls
`transfers.delete`. This works from either leg — tapping the income leg opens the same sheet, and
deleting the row unmarks both.

## Testing

Vitest on both sides. Pure-logic tests only, matching the existing convention (no component tests
exist in the repo).

**Backend**

- `backend/src/repositories/transferRepository.test.ts` — expense XOR rejection (neither set, both set), income at-most-one rejection, unpaired insert accepted, `fromRow` mapping.
- `backend/src/routers/transfers.test.ts` — zod rejection of an unknown `kind`, auth scoping, list/create/delete happy paths. Mirrors `reimbursements.test.ts`.

**Frontend**

- `frontend/lib/transfers/registry.test.ts` — per-type `matches` truth table: exact amount; 5% tolerance just inside and just outside; ±7 days just inside and just outside; same-account rejection for `account_transfer`; liability-account requirement for `credit_card_payment`; null-account handling for manual items. Plus a test asserting every entry in `TRANSFER_KINDS` has a registry definition.
- `frontend/lib/transactions/resolveFeed.test.ts` — `applyTransfers` stamps both legs; unpaired transfer stamps only the expense; a transfer whose income leg is outside the loaded window leaves the expense correctly stamped.
- `frontend/lib/transactions/totals.test.ts` — `countsTowardTotals` for each combination of reimbursement income and transfer kind.
- `frontend/lib/transactions/aggregateMonth.test.ts` — both legs excluded from `totalExpense`, `totalIncome`, `spendByCategory`, `incomeByCategory`, `spendByDay`; existing reimbursement exclusion still passes.

## Out of scope

- Auto-detection of transfers. Every transfer is marked by the user.
- Bulk marking, or a rule like "always treat transfers from checking to savings as transfers".
- A dedicated transfers management screen. Transfers are viewed and unmarked from the feed.
- Excluding transfers from the feed view, or a "hide transfers" filter.
