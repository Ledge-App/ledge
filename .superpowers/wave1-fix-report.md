# Wave 1 Fix Report

Repo: `/Users/qihongwu/VSCode/ledger`, branch `main`. Five review findings fixed across four
frontend files, in three commits.

| Commit | Scope | Files |
| --- | --- | --- |
| `f719d2b` | Fix 1 | `frontend/constants/plaid.ts` |
| `59cfdb5` | Fix 2 (partial) + Fix 3 | `frontend/components/transactions/CategorySheet.tsx`, `frontend/components/reimbursements/ReimbursementSheet.tsx` |
| `90b7ea4` | Fix 2 (partial) + Fix 4 + Fix 5 | `frontend/components/transactions/ManualTransactionSheet.tsx` |

No file outside these four was modified.

---

## Fix 1 — `PFC_TAXONOMY` regenerated from the backend source of truth

`frontend/constants/plaid.ts`

The hand-duplicated taxonomy had drifted from `backend/src/lib/plaid/pfc.ts`'s
`DEFAULT_PFC_MAPPING`. Replaced the `PFC_TAXONOMY` array with a mechanical
`{ primary: entry.primary, detailedCodes: entry.detailedCodes }` derivation of every backend
entry, in the same order. `ledgeCategory`, `color`, `icon`, and `subcategories` are dropped —
the `PfcGroup` interface only carries `primary` + `detailedCodes`. The `PfcGroup` interface and
`pfcLabel` function are byte-identical to before; only the array contents and the header comment
changed. The comment now states the array is a mechanical derivation that must be regenerated
whenever the backend file changes.

Removed (7 invented codes that do not exist in Plaid PFC v2):

- `RENT_AND_UTILITIES_ELECTRICITY` (real code is `..._GAS_AND_ELECTRICITY`)
- `MEDICAL_DOCTOR_VISITS` (real: `MEDICAL_PRIMARY_CARE`)
- `MEDICAL_DENTAL` (real: `MEDICAL_DENTAL_CARE`)
- `MEDICAL_VISION` (real: `MEDICAL_EYE_CARE`)
- `PERSONAL_CARE_GYM_AND_FITNESS` (real: `..._GYMS_AND_FITNESS_CENTERS`)
- `GENERAL_SERVICES_SUBSCRIPTION` (no such code)
- `GENERAL_SERVICES_FINANCIAL_PLANNING_AND_MANAGEMENT` (real: `..._ACCOUNTING_AND_FINANCIAL_PLANNING`)

Added: 41 previously-missing real codes, including all 10 absent `GENERAL_MERCHANDISE_*` codes
that onboarding actually seeds (`DEPARTMENT_STORES`, `DISCOUNT_STORES`, `PET_SUPPLIES`,
`SPORTING_GOODS`, `BOOKSTORES_AND_NEWSSTANDS`, `CONVENIENCE_STORES`, `TOBACCO_AND_VAPE`,
`GIFTS_AND_NOVELTIES`, `OFFICE_SUPPLIES`, plus the corrected set), and the missing entries under
`ENTERTAINMENT`, `TRAVEL`, `RENT_AND_UTILITIES`, `MEDICAL`, `PERSONAL_CARE`, `HOME_IMPROVEMENT`,
`GENERAL_SERVICES`, `INCOME`, `TRANSFER_IN`, `TRANSFER_OUT`, `LOAN_PAYMENTS`, `BANK_FEES`, and
`GOVERNMENT_AND_NON_PROFIT`.

### Parity check

Extracted every SCREAMING_SNAKE string literal from the backend's `DEFAULT_PFC_MAPPING` and the
frontend's `PFC_TAXONOMY` and compared them as ordered lists:

```
$ node -e "...extract and compare uppercase string literals from both files..."
backend n= 124 frontend n= 124
identical order+content: true
missing in fe: []
extra in fe: []
```

124 tokens = 16 primaries + 108 detailed codes, matching exactly in content and order.

---

## Fix 2 — Stale sheet state when reused for a different transaction

All three sheets are rendered once per screen as persistent instances whose `visible` prop is
toggled, so their `useState` initializers only ran at first mount: opening for transaction A,
selecting, closing, then opening for B showed A's selections, and saving wrote A's data onto B.

Each component gained a `useEffect` that re-derives the initial values exactly as the `useState`
initializers do (initializers kept, so first mount and prop changes both work). Each effect is
placed above the component's early `return null` guard so hook order stays stable.

- `CategorySheet` — resets `categoryId` (`item?.categoryId ?? null`), `subcategoryId`
  (`item?.subcategoryId ?? null`), `applyToVendor` (`true`), `markReimbursed` (`false`);
  deps `[item?.id]`.
- `ReimbursementSheet` — resets `linkedIds` to `[]`; deps `[expenseItem?.id]`.
- `ManualTransactionSheet` — resets `type`, `amountText`, `categoryId`, `subcategoryId`, `date`,
  `note`; deps `[transaction?.id]`. `undefined` differs from any real id, so the
  edit -> create-new transition (and the reverse) also resets.

---

## Fix 3 — `ReimbursementSheet` income sign

`FeedItem`'s convention is positive = expense, negative = income, and the net-expense math
already used `Math.abs(c.amount)`. The two display call sites rendered the raw negative value, so
a linked item showed `-$50.00` in the income color directly beside a
`Net expense: $100 − $50 = $50` line treating it as positive. Both now use `Math.abs`:

- unlinked candidate row: `formatAmount(Math.abs(candidate.amount))`
- linked row: `formatAmount(Math.abs(linked.amount))`

---

## Fix 4 — `ManualTransactionSheet` timezone off-by-one

`date` is a timezone-less calendar day (`YYYY-MM-DD`), but it was round-tripped through
`new Date(date)` (parses as UTC midnight) and `selected.toISOString().slice(0, 10)` (also UTC)
while `DateTimePicker` renders and reports in the device's LOCAL timezone. In any non-UTC zone
this shifted the displayed and saved day by one.

Added local-time helpers `toDateKey(date: Date): string` (`getFullYear` / `getMonth` + 1 /
`getDate`, zero-padded) and `fromDateKey(dateKey: string): Date` (`new Date(year, month - 1, day)`),
and replaced all three UTC conversions:

- picker `value`: `fromDateKey(date)` instead of `new Date(date)`
- picker `onChange`: `toDateKey(selected)` instead of `selected.toISOString().slice(0, 10)`
- default-to-today initializer and reset effect: `toDateKey(new Date())`

---

## Fix 5 — Android picker modal and sheet overflow

(a) On Android `display="default"` renders a modal dialog that popped open as soon as the
component mounted or became visible. The Android branch is now a tappable "Date" row showing the
current `date`, gated by a `showAndroidPicker` boolean (default `false`); the picker mounts only
while that flag is true and clears it in `onChange`. iOS keeps its unconditional
`display="inline"` embedded calendar, which is not a popup.

(b) The sheet's content (segmented control, amount, category picker, subcategory chips, full date
picker, note, save/delete) could overflow `BottomSheet`'s `max-h-[85%]` with no scrolling, making
the delete button unreachable. Wrapped the content in a `<ScrollView>` at this call site inside
`ManualTransactionSheet`; `BottomSheet` itself is unmodified, so its outer container stays
fixed-height while its content scrolls internally.

---

## Verification

Both commands run from `/Users/qihongwu/VSCode/ledger/frontend` in a real, non-symlinked checkout.

```
$ npx tsc --noEmit
TSC_EXIT=0
```

Zero errors, no output.

```
$ npx vitest run

 RUN  v2.1.9 /Users/qihongwu/VSCode/ledger/frontend

 ✓ lib/categories/pfcOwnership.test.ts (3 tests) 2ms
 ✓ lib/storage/mmkv.test.ts (2 tests) 9ms
 ✓ lib/transactions/resolveFeed.test.ts (18 tests) 4ms
 ✓ lib/transactions/filterByMonth.test.ts (6 tests) 2ms

 Test Files  4 passed (4)
      Tests  29 passed (29)
   Duration  375ms
```

All 29 tests across 4 files pass. No existing test covers these four files directly, so this
confirms nothing else broke rather than proving the fixes; the Fix 1 parity check above is the
direct evidence for that change.

`git status` after committing shows a clean `frontend/` tree and leaves the pre-existing
unrelated backend modifications untouched.

## Re-review outcome
All 5 findings ADDRESSED, verified clean by independent re-review (PFC taxonomy parity confirmed code-for-code against backend). Minor deferred (not blocking):
- Sheet reset effects don't fire when identifying prop is unchanged between opens (e.g. add-then-add-again) — would need `visible` added to dep arrays.
- BottomSheet's `max-h-[85%]` likely doesn't resolve (unstyled Pressable parent, Yoga can't compute % against auto-sized parent) — pre-existing primitive defect, blunts ManualTransactionSheet's new ScrollView. Out of scope for this fix, worth a follow-up touching the shared primitive.
- ManualTransactionSheet's new ScrollView has no keyboardShouldPersistTaps="handled" — first tap while amount field focused just dismisses keyboard.

Wave 1 (Tasks 1,2,3,4,6,9,10,11) is complete and merged to main.
