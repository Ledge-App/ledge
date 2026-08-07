# Plaid Environment Lockdown

**Date:** 2026-08-07
**Status:** Approved, not yet implemented

## Problem

Users can switch their Plaid credentials between `sandbox` and `production` at will. Doing so
breaks the app.

Plaid access tokens are environment-scoped and client-scoped: a token minted under one
`client_id` + environment is only valid against that environment's host with that account's
keys. The schema does not model this coupling.

- `plaid_credentials` holds one row per user (`user_id` is unique) and `save` is a blind upsert
  that overwrites `environment` in place — `backend/src/repositories/plaidCredentialRepository.ts:9`.
- `plaid_items` has no environment column and is never touched when credentials change —
  `backend/src/lib/db/schema.ts:37`.

After a switch, every stored access token is orphaned. There is no migration path; Plaid
requires re-linking.

### Why it breaks the whole app rather than one account

`accounts.list` loops over items with no error isolation
(`backend/src/routers/accounts.ts:15-22`). One dead token throws out of the entire tRPC query.
That query is the root of the feed: `useTransactionFeed` derives `itemIds` from `accounts.data`,
so `itemIds` becomes empty, no sync runs, and `accounts.error` propagates as the feed's error.
Dashboard, transactions, and net worth all fail together.

`transactionSyncService.ts:44-49` already isolates per-item failures deliberately.
`accounts.list` never got the same treatment, which is what converts "stale items" into total
breakage.

### The likelier trigger than deliberate switching

`PlaidCredentialsForm.tsx:23` initialises `useState<PlaidEnvironment>('sandbox')` and never seeds
it from `existing.environment`. A production user who opens "Replace Keys" to rotate their secret
and does not touch the segmented control silently saves `environment: 'sandbox'` with production
keys. The save path does not catch it: `plaidCredentialService.testCredentials` only asserts that
the keys reach Plaid, and treats `INVALID_ACCESS_TOKEN` as success, so a mismatched env/key pair
passes the test.

## Policy

Enforced server-side, not merely in the UI:

1. **Environment is chosen once**, at first credential save, and is immutable afterwards.
2. **Non-dev users get `production`.** No toggle renders, and the server rejects any other value
   rather than trusting the client.
3. **Devs (email allowlist) choose `sandbox` or `production`** at first save, then are frozen on
   the same terms as everyone else.
4. **`client_id` is immutable too.** Replace Keys becomes Update Secret. Secret rotation is the
   real use case and never invalidates tokens.

Rules 1 and 4 together mean an item can never outlive the credentials that minted it, so no
purge, tagging, or reconciliation machinery is needed.

The environment enum narrows from `sandbox | development | production` to `sandbox | production`.
`development` is a dead Plaid environment, already absent from the UI, and a third state nothing
enforces.

## Data model

- **`dev_emails`** — new table, `email text primary key`, `created_at timestamptz not null default now()`.
  Seeded by hand via SQL. Deliberately not editable in-app.
- **`verifyJwt`** additionally returns the verified `email` claim; `ctx` carries it alongside
  `userId`. No join against `auth.users` and no new trust surface — it is the same signature
  already verified.
- **`plaid_credentials`** and **`plaid_items`** are structurally unchanged.

A `devEmailRepository.isAllowed(email)` lookup backs a single `resolveAllowedEnvironments(email)`
helper. That function is the entire dev concept; nothing else in the codebase asks about dev
status directly.

## Enforcement points

- `plaidCredentialService.save` is the sole gatekeeper. On **first** save it validates the
  requested environment against the caller's allowed set. On **subsequent** saves it rejects
  outright if `environment` or `clientId` differ from the stored row, rather than silently
  discarding the fields.
- `plaidCredentials.test` runs against the stored environment and `client_id` when a row exists,
  so a rotation test verifies what will actually be saved.
- New `plaidCredentials.capabilities` query returns `allowedEnvironments`, which the form uses to
  decide whether the toggle exists at all.
- **`accounts.list` gains per-item error isolation**, matching `transactionSyncService`. The
  procedure returns `{ accounts, itemErrors }`. Immutability stops tokens going stale from env
  switches, but items still die from `ITEM_LOGIN_REQUIRED` or a revoked connection, and today any
  one of those takes the whole app down. The policy work fixes the trigger; this fixes the
  amplifier.

## Frontend

`usePlaidCredentials` gains `allowedEnvironments` from the capabilities query.
`PlaidCredentialsForm` splits three ways:

- **First-time setup, non-dev:** no Environment control renders. No mention of sandbox in the
  copy — for these users the concept does not exist.
- **First-time setup, dev:** the segmented control appears with **no default selection**, and Save
  stays disabled until one is picked. This is the direct fix for the `useState('sandbox')` default.
  Since the choice is now permanent, defaulting to anything is wrong; the dev states it explicitly.
- **Existing credentials:** the read-only summary stays as-is. "Replace Keys" becomes **"Update
  Secret"**, and the sheet contains only the secret field, Test, and Save. Client ID and
  environment are not editable, so they are not inputs.

`useAccounts` unwraps the new procedure shape so `.data` remains the same array it is today; the
four hook consumers need no change. Only `useOnboardingGate.ts:17`, which calls the procedure
directly, needs a `.accounts` adjustment. `itemErrors` surfaces as a new hook field, rendered on
the Accounts screen as a per-institution "couldn't load" row rather than an app-wide error.

## One-time data reset

Pre-launch, so existing rows are not grandfathered or migrated. All app data is truncated and
Supabase `auth.users` is kept, so everyone stays logged in and restarts onboarding from zero.

The reset is a hand-run SQL statement, deliberately **not committed to the repo** and not wired
into application boot. It truncates `transfers`, `reimbursements`, `transaction_overrides`,
`budgets`, `vendor_mappings`, `plaid_category_mappings`, `manual_transactions`, `subcategories`,
`categories`, `plaid_items`, and `plaid_credentials`.

It must be run **after** this change ships. Running it first only lets the next app launch write
fresh rows under the old rules.

## Testing

Tests first, per TDD.

- **Service:** non-dev requesting sandbox is rejected; non-dev production saves; dev sandbox
  saves; a second save with a different environment is rejected; a different `client_id` is
  rejected; secret-only rotation succeeds; `test` on an existing row uses the stored
  environment and `client_id` rather than the input.
- **Repository:** allowlist hit and miss.
- **Auth:** `verifyJwt` returns the email claim under both the HS256 and JWKS paths.
- **`accounts.list`:** one item throwing returns the surviving accounts plus an `itemErrors`
  entry instead of throwing. This is the regression test for the reported bug.

## Known edges

- **Allowlist is keyed on email**, so it inherits Supabase's email-change semantics. Changing the
  email on a dev account silently drops dev status. Acceptable at this size; the fix is a one-line
  SQL update.

## Deferred

**Moving to a different Plaid account** (a genuinely new `client_id`) has no in-app path. It was
considered and deliberately dropped: the machinery is cheap, but re-linking under a new client
mints new `plaid_transaction_id`s, so every row keyed by the old ids —
`transaction_overrides`, and the plaid legs of `transfers` and `reimbursements` — becomes
permanently dangling. Handling that is its own feature, not a clause in this one.

If a real user needs it, the shape is: detect a differing `client_id` on save, best-effort
`itemRemove` each item with the **old** keys, delete `plaid_items`, signal the client to clear
MMKV transaction caches and cursors, delete the `plaid_transaction_id`-keyed rows, and land the
user on a clean "connect a bank" state.

Until then, a user in this position needs their rows cleared by hand.
