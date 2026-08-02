# Wave 4b Fix Report — transactions.tsx code review findings

File: `frontend/app/(tabs)/transactions.tsx`

## Fix 1 — Calendar cells ignored the account filter (Important)

Calendar cells previously read `netAmount`/`hasReimbursement` from `spendByDay` (from `useTransactionFeed()`), which is computed over the entire unfiltered feed. This diverged from the summary bar and selected-day list, both of which use `monthFeed` (account+month filtered).

Change:
- Removed `spendByDay` from the `useTransactionFeed()` destructure in this file (still returned by the hook itself; just unused here now).
- Added a new `spendByDayFiltered` `useMemo` that aggregates net amount and reimbursement flag per day from `monthFeed`.
- Calendar cell render now reads `spendByDayFiltered.get(cell.dateKey)?.net ?? null` and `spendByDayFiltered.get(cell.dateKey)?.hasReimbursement ?? false`.

Calendar cells, the summary bar, and the selected-day list are now all derived from the same account-filtered `monthFeed`, so they stay consistent when an account filter is active.

## Fix 2 — `todayKey` used UTC instead of local time (Minor)

Replaced:
```ts
const todayKey = new Date().toISOString().slice(0, 10)
```
with local-date computation:
```ts
const now = new Date()
const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
```
This matches `currentMonth()`'s local-time semantics and the local calendar dates used elsewhere in the feed, avoiding the wrong-day highlight in UTC-negative timezones.

## Fix 3 — `selectedDay` not reset on month change (Minor)

Added:
```ts
useEffect(() => {
  setSelectedDay(null)
}, [month])
```
placed right after `monthFeed` is computed, near the other state/derived values. Imported `useEffect` by adding it to the existing `react` import line (`import { useEffect, useMemo, useState } from 'react'`) rather than a separate import statement.

Paging months now clears the stale selected-day, avoiding the confusing empty "selected day transactions" gap.

## Fix 4 — No weekday header row on calendar grid (Minor, required by design.md)

Added a weekday header row immediately above the existing calendar day grid `View`, using the same `14.28%` column width as day cells:
```tsx
<View className="mb-2 flex-row">
  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
    <Text key={day} className="text-center font-sansMed text-xs text-textMuted" style={{ width: '14.28%' }}>
      {day}
    </Text>
  ))}
</View>
```

## Fix 5 — No bottom padding under FAB for calendar's selected-day list (Minor)

Added `contentContainerStyle={{ paddingBottom: 96 }}` to the calendar view's selected-day `FlatList` (rendering `selectedDayItems`), matching the list view's `SectionList` padding so rows aren't hidden under the floating `+` button.

## Verification

- `cd frontend && npx tsc --noEmit` — clean, zero errors/output.
- `cd frontend && npx vitest run` — 4 test files, 29 tests, all passed.

## Commit

Single commit containing all 5 fixes to `frontend/app/(tabs)/transactions.tsx`.
Commit hash: d690483
