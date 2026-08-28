# Design: Automatic internal-transfer detection

Status: proposal · Scope: automatically detect **credit-card payments** and **account-to-account
transfers** (debit → savings / cash mgmt) as internal transfers, and correct history when the
counterpart account is linked later.

## Problem

Money moving between the user's own accounts must not distort totals:
- **Credit-card payment** — not spending on the debit account, not income on the card (the real
  spend is already the card's individual purchases).
- **Account transfer** — neither expense nor income; the money never left the household.

Today these only get excluded if the user marks them by hand. We want them detected automatically,
correct across the lag between the two legs, and self-correcting when an account is linked late.

## Why this is tractable: totals are derived

ToFi stores no transactions and no precomputed totals. Every number is derived on the client from
`feed + transfers` at render time (`aggregateMonth.ts:33` skips anything `isTransfer()`), and the
persisted `transfers` table is the only state involved.

Consequence: **fixing history is just inserting a transfer row.** No aggregate migration, no
double-count risk to unwind — the next render recomputes affected months with the payment excluded
and the card's purchases included. This is what makes "link the card months later" cheap.

## Core rule: pair the two legs

Detection never excludes a lone transaction — a single outflow is indistinguishable from a real
expense. It only ever creates a **paired** transfer (both legs present). That single principle
resolves the timing lag for free:

| State | Treatment |
|---|---|
| Counterpart leg found on a **linked** account | Transfer — exclude both legs |
| No counterpart yet (lag, or account not linked) | Count normally; re-checked each sync, flips to a transfer when the counterpart arrives |

For a **card payment**, the unmatched outflow correctly stays an **expense** (it's the only proxy
for that spend until the card is linked). For an **account transfer**, an unmatched leg counts per
its sign until matched. Errors therefore bias toward *leaving money counted* (mild, self-correcting)
rather than *wrongly hiding it* (dangerous) — see Risk.

### The one exception: movements whose counterpart can never arrive

The rule above assumes an unmatched leg is unmatched *for now* — the counterpart is late, or the
account isn't linked yet. Some movements break that assumption permanently, and for those, waiting
for a pair means counting them as spending forever.

A **cash management account** sweeps deposits into a fund. Plaid reports the sweep as an outflow on
the cash side, but its counterpart is an *investment transaction*, served by
`/investments/transactions/get` — a separate Plaid product this app doesn't read. It can never
appear in `/transactions/sync`, so no pairing is possible, ever.

These are excluded on their PFC code alone, via `INTERNAL_MOVEMENT_PFC` in
`lib/transactions/totals.ts`. The set is kept deliberately narrow — currently only
`TRANSFER_{IN,OUT}_INVESTMENT_AND_RETIREMENT_FUNDS` and `TRANSFER_{IN,OUT}_SAVINGS` — and a code
belongs in it only when both hold:

1. Pairing is *structurally* impossible, not merely pending.
2. No purchase is hiding behind it, so excluding it can't make spend totals under-count.

Card payments fail (2) and stay out of the set. `*_ACCOUNT_TRANSFER` fails both — pairing handles
it, and since Plaid's taxonomy has **no peer-to-peer code at all**, Venmo/Zelle to a person lands
on that generic code next to genuine internal moves, as does ACH rent. `TRANSFER_IN_DEPOSIT`
("Cash, checks, and ATM deposits into a bank account") and `TRANSFER_OUT_WITHDRAWAL` are real
money in or out.

All four codes in the set are byte-identical in PFCv1 and PFCv2, verified against Plaid's
published taxonomy. That check is required for anything keyed on a PFC code: this app never sets
`options.personal_finance_category_version` on `/transactions/sync`, so under BYOK each user's own
Plaid account decides which taxonomy version they receive (v2 by default only for Transactions
access enabled after 2025-12-03).

This exception does bias toward *hiding* money, against the preference stated above, so the
narrowness of the set is what keeps the risk contained.

## Detection: amount-indexed matching

Auto-apply requires an **exact** amount, so the amount is a hash key — no O(n²) scan.

```
// DRIVER set (what we iterate): posted, un-transferred, non-dismissed items with a strong signal,
//   in BOTH directions (see below) — tagged outflows OR credit-account / transfer-tagged inflows.
// INDEX (what we match against): posted, un-transferred items filtered by sign + account type,
//   NOT by tag, built over the full current cache.
inflowsByAmount / outflowsByAmount : Map<cents, FeedItem[]>   // build O(index) once per scan

match(X):   // X is a driver, either sign
  bucket = (X.amount>0 ? inflowsByAmount : outflowsByAmount).get(cents(X))   // O(1) — this is the "scan"
  candidates = bucket.filter(withinDays(7) & differentAccount & kindGate)
  1 candidate + high confidence → auto-apply (source:'auto')
  >1 candidate                  → suggestion (one-tap confirm)
  0                             → leave counted; re-checked next sync
```

Efficiency comes from three framing choices, not from micro-optimization:

- **Pre-filter the *driver* set (bidirectional), index the counterpart set by account type — not
  the tag.** Plaid tags legs asymmetrically (outflow tagged `ACCOUNT_TRANSFER`, matching inflow
  tagged generic `DEPOSIT`, or vice versa), so requiring the tag on *both* legs would silently miss
  real pairs. **Drive** from strong-signal items in *both* directions:
  - outflows tagged `*_CREDIT_CARD_PAYMENT` / `*_ACCOUNT_TRANSFER` / `TRANSFER_OUT_*`, **and**
  - inflows on a **credit** account (a card payment landing) or tagged `TRANSFER_IN_ACCOUNT_TRANSFER`.

  Driving both signs is what makes reconciliation work *through the delta*: on card-link the payment
  **inflows** are the delta and must drive to find the old debit outflows in the index. An
  outflow-only driver set would pair nothing on card-link and push all reconciliation onto the
  Phase-5 full scan. The driver set is still ~1–5% of the cache. **Index** the counterparts by sign +
  account type without requiring their own tag — a card-payment counterpart is any inflow on a credit
  account / any depository outflow; an account-transfer counterpart is any opposite-sign leg on a
  different account in the window. Gate = strong-signal-on-driver + exact amount + counterpart account
  type. An asymmetric-tag pair still matches (the signalled side drives); a pair with no signal on
  either side is never driven (correct — nothing to go on).
- **Drive the delta, index the full current cache — never cache × cache.** One rule for every
  trigger: build the index over *all* eligible items currently in the cache, and iterate (drive) only
  over this sync's `added`/`modified` items. On an account-link the sync has already merged the new
  account into the cache, so "the full cache" includes the new items — don't exclude them from the
  index. This is O(eligible) to build + O(delta) to drive, never O(n²); old items sit passively in
  the index and are never re-driven (old×old pairs are already decided). The single rule covers all
  cases: reconciliation (new card inflow drives, finds the old debit outflow in the index),
  **simultaneous multi-account link** (checking + card linked together — both legs are new and both
  are in the current cache, so whichever one drives finds the other), and steady state (the delta
  finds an older counterpart). Because drivers are bidirectional, this delta scan *alone* reconciles
  — the Phase-5 account-link full scan becomes a completeness optimization for history already in
  cache, not a correctness requirement. Because a same-delta pair is discoverable from both sides,
  dedupe matched items as you go; the partial-unique indexes are the backstop.
- **Batch the writes, conflict-ignore.** The compute is cheap; the cost of a backfill is the write
  burst. Use a bulk `transfers.createMany` (chunked) so N matches insert in one/few round-trips, not
  N mutations. It must insert `ON CONFLICT DO NOTHING` against the partial-unique indexes —
  `transferRepository.create` throws on any error (`transferRepository.ts:91`), so without
  conflict-ignore a single multi-device race would fail the whole chunk. Treat a skipped
  (already-existing) row as **success, not a retry**, or the scan re-attempts it every sync. For a
  large first-link, run the scan after the linking flow (off the interaction thread) so it never janks.

**Pagination caveat (prerequisite bug).** A new Item has no cursor, so Plaid's `transactionsSync`
*semantics* return its full history — but the **client currently drains only the first page**.
`transactionRepository.sync` sends no `count` (`transactionRepository.ts:4`, Plaid defaults to
100/page), `transactionSyncService` collapses per-item `has_more` into one OR'd boolean
(`transactionSyncService.ts:43`), and `useTransactionFeed`'s `onSuccess` ignores it
(`useTransactionFeed.ts:40-72`) — nothing re-triggers pagination. So a freshly linked card's first
sync yields ~100 transactions; the rest trickle in ~100 per app-open (arriving as `added` deltas,
which do drive and pair). Until fixed, the account-link scan sees a fraction of the card's history
and reconciliation corrects in 100-transaction increments over many opens — the visibly-broken
history symptom. **Fix before Phase 5:** make `hasMore` per-item (`Record<itemId, boolean>` — the
current OR loses granularity, so draining one item would re-sync all) and loop the sync until every
item is drained. Existing Items' transactions stay in cache and are not re-emitted — which is why the
counterpart legs are found in the cache index, not in the sync response.

**Confidence gate uses Plaid's PFC** (verified against Plaid's taxonomy CSV):
- Card payment: `pfcDetailed === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'` **and** counterpart on a
  `type === 'credit'` account. Narrowing to this exact code + credit account is what keeps mortgage
  / car payments (also `LOAN_PAYMENTS_*`) from being swept up.
- Account transfer: require `pfcDetailed === 'TRANSFER_OUT_ACCOUNT_TRANSFER'` on the **outflow** leg.
  Requiring the transfer code (not just a matching amount) is what excludes ordinary purchases —
  a real purchase is tagged `GENERAL_MERCHANDISE`, never `ACCOUNT_TRANSFER` — so it can never be a
  candidate. This is the substitute for the card-payment case's built-in "must be a credit account"
  filter (see Risk).
- **Never pair against real income.** An inflow tagged `INCOME_*` (`INCOME_DIVIDENDS`,
  `INCOME_INTEREST_EARNED`, `INCOME_WAGES`, …) is genuine income, never a transfer's income leg —
  exclude it from candidate counterparts. This is what lets a **cash-management account's dividends
  and interest count as income** while transfers *into* the same account are excluded: a dividend has
  no equal-and-opposite outflow to pair with, and this rule additionally stops a coincidental
  same-amount transfer-out from mispairing with it. Safe because it *excludes* a strong signal (real
  income) rather than *requiring* one — Plaid never tags a genuine transfer-in as `INCOME_*`.
- **Auto-apply only** on the exact code + a single exact-amount match. Anything looser (generic
  `TRANSFER_OUT_*`, multiple candidates, ±5% amount) becomes a suggestion, never a silent exclusion.

## Required change + data model

Small and additive:

1. **`FeedItem.pfcDetailed`** — `mergeFeed` (`resolveFeed.ts:68`) currently drops
   `personal_finance_category.detailed`. Plumb it through; the confidence gate needs it. (The
   existing interactive matcher uses no PFC — this is new, purely to cut false positives.)
2. **`transfers.source`** — `'manual' | 'auto'`, default `'manual'`. Lets the UI badge/undo auto
   matches. The `transfers` table already supports optional income legs, `kind`, and partial-unique
   indexes that block a transaction being pulled into two transfers (multi-device race backstop).
3. **`transfer_dismissals(user_id, expense_txn_id, …)`** — records when a user unmarks an auto
   transfer, keyed on the outflow leg. Without it the idempotent scan re-creates it every sync.

Detection stays **client-side** over the MMKV cache — the only place the full feed exists —
consistent with the stateless-relay backend. Suggestions are recomputed each render, not persisted.

## Triggering

**As implemented, detection runs over the full cache on every feed change** — a deliberate
revision of this doc's earlier "drive only the sync delta" framing, made when implementation
showed the delta restriction saves almost nothing: the candidate index is built O(eligible) over
the full cache either way, and drivers are pre-filtered to transfer-tagged items (~1–5%). Full
detection buys two correctness wins delta-driving can't:
- **No cross-session gap.** Delta-only driving misses a pair whose tagged leg synced in an earlier
  session (session-scoped delta) when the untagged counterpart arrives later. Full detection
  revisits every unresolved tagged leg each pass.
- **Account-link needs zero trigger code.** Linking fires the existing itemIds-change sync, the
  new Item (no cursor) drains its full history into the cache (Phase 0), the next detection pass
  pairs it against everything — old×new, new×new, whichever side carries the tag. There is no
  separate "account-link scan" to forget or get wrong.

Idempotence is what makes every-pass detection safe: already-transferred legs are stamped by
`applyTransfers` and skipped, dismissed legs are skipped, a posted-pairs ref stops re-POSTing
while the list invalidation is in flight, and the DB's partial-unique indexes backstop the rest.

**Freshness (lag):** an unmatched leg is re-checked on every subsequent pass; correctness never
needs a special trigger. *Optional* optimization: Plaid's `SYNC_UPDATES_AVAILABLE` webhook → a
Vercel endpoint that only bumps `plaid_items.updates_available_at` (stores no transactions) → the
client syncs just the dirty items. Add only if same-session freshness proves insufficient.

## Reconciliation: link the card later

1. Only debit linked → the card payment is counted as an expense (correct; nothing else represents
   that spend).
2. Card linked → sync backfills the card's purchases **and** the payment inflow.
3. The account-link full scan pairs the old debit payment with the inflow → inserts a transfer.
4. History recomputes: the payment drops out, the card's purchases come in. No double-count.

Bounds: pairing needs both legs in cache, so depth is limited by Plaid's history window; log how far
back the scan reached. Statement lag (a payment settles last month's purchases) shifts per-month
totals — inherent to credit cards, correct in aggregate, don't re-time it.

## Risk & rollout

Failure modes are asymmetric and the design leans safe: a miss leaves money **counted** (mild,
user can fix); the gate (exact amount + exact PFC code + single candidate + paired-only) exists to
avoid the dangerous case of **wrongly excluding** real spend.

Both kinds use the **same engine and the same auto-apply gate**, and both auto-apply about as
safely — exact amount does the core counterpart disambiguation for both (only one account received
exactly $X). Differences are modest:

- **Card payments:** get a *bonus* structural filter — the counterpart must be on a **credit**
  account — on top of amount + PFC code. Strongest signal. Consider widening the 7-day window to
  ~10–14 after seeing real data.
- **Account transfers:** no account-type filter, so they lean on the `ACCOUNT_TRANSFER` PFC code +
  exact amount (purchases are never tagged `ACCOUNT_TRANSFER`). Slightly noisier → a bit more falls
  to suggestions, from (a) Plaid tagging one leg but not the other and (b) multiple same-amount
  candidates in the window. Note the multi-candidate case is
  usually **total-safe anyway**: if all candidates are genuine transfers, a mispaired link still
  excludes both legs correctly. The only harmful failure — shared with card payments — is Plaid
  mis-tagging a real expense as a transfer, minimized identically by the exact-tag + exact-amount gate.
- **Unlinked / external counterpart:** correctly stays a normal expense.

**P2P is filtered from auto-apply, not from matching.** `TRANSFER_OUT_PEER_TO_PEER_PAYMENT` is in the
broad `TRANSFER_OUT_*` **driver** class, so a Zelle/Venmo *can* be driven and surface as a suggestion
— it's only excluded from **auto-apply**, which requires the exact `ACCOUNT_TRANSFER` code. Don't
"optimize" the driver set assuming P2P is excluded entirely; it isn't.

**De-risk before trusting auto-apply:** ship detection in suggestion-only mode first, log every
would-be auto-apply, measure match rate and false positives against real Plaid data, then enable
auto-apply for the tier that proves clean.

## Phases

0. ✅ **Prerequisite — drain sync pagination.** `hasMore` is per-item (`Record<itemId, boolean>`);
   the backend drains up to 10 pages × `count: 500` per item per request
   (`transactionSyncService.ts`), and `useTransactionFeed` keeps re-syncing while any item reports
   more (bounded backstop). Cursor persists per page (valid resume point);
   `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` restarts from the original cursor per Plaid's
   contract.
1. ✅ Plumbed `pfcDetailed` onto `FeedItem` (`resolveFeed.ts`).
2. ✅ Pure `autoMatch.ts` (amount-indexed, **bidirectional drivers**, 25 unit tests). Two hardenings
   beyond this doc, discovered in implementation: **mutual uniqueness** for auto-apply (the pair must
   be unambiguous from *both* directions, killing driver-order dependence — two same-amount outflows
   + one credit inflow is a suggestion, never a silent pick), and **at most one suggestion per feed
   item** (competing alternatives collapse to the nearest-date default instead of two rows claiming
   the same transaction).
3. ✅ Suggestions-only on the sync delta: `useTransactionFeed` exposes `transferSuggestions`
   (`confidence: 'high' | 'medium'`; high = would qualify for auto-apply). Nothing persists, so no
   total can move; the high tier exists to measure precision before Phase 4 enables auto-apply.
   **— Phases 1–3 are the robust MVP: nothing auto-applies, so no total can move.**
4. ✅ **Auto-apply.** `transfers.source` ('manual'|'auto', CHECK + kinds.test sync) and
   `transfer_dismissals` (unique per user+expense-leg, RLS) in migration
   `0004_add_auto_transfer_support`. `transfers.createMany` bulk endpoint: auto kinds only,
   always-paired Plaid legs enforced by the input schema, per-row inserts where a unique
   violation (23505) counts as *skipped success* — PostgREST can't express ON CONFLICT
   DO NOTHING against partial unique indexes, so conflict-ignore lives in the repository.
   `useTransactionFeed` auto-applies high-confidence drafts (posted-pairs ref against
   re-POSTs, chunked to the 100-row bound, best-effort: a failed POST leaves the pair
   *counted*). `useTransfers.unmark` is the single unmark path: it writes the dismissal
   BEFORE deleting (failure order matters) and on every unmark, not just auto ones — a
   manually created transfer with an auto-detectable pair would otherwise bounce back.
5. ✅ **Account-link scan** — delivered by the full-cache detection switch (see Triggering):
   linking → itemIds-change sync → Phase-0 drain → next detection pass covers the new
   account against the whole cache. No dedicated trigger code exists, by design.
6. ✅ **Orphan cleanup.** Event-driven, never absence-driven: Plaid `removed` ids are queued
   **durably in MMKV** at merge time (a removal is emitted exactly once; after the merge,
   cache absence is indistinguishable from "outside the history window", and a rebuilt cache
   makes absence-sweeping actively wrong), then reconciled by `findOrphanedTransfers`
   (`lib/transfers/orphanCleanup.ts`, pure, 10 tests): any transfer referencing a retracted
   leg dissolves; `source: 'auto'` transfers additionally dissolve on amount/sign **drift**
   of a *present* leg (manual transfers are exempt — the sheet tolerates ±5% and the user
   vouched). A queued id clears only when no transfer references it — verified through the
   refetched list after deletion — so failed deletes retry instead of being lost. Dissolving
   writes **no dismissal**: the pair ceased to exist, and a corrected re-post must be free
   to auto-match again.
7. Optional: `SYNC_UPDATES_AVAILABLE` webhook.
8. Suggestions UI: surface `transferSuggestions` (the medium tier) as one-tap confirms.
