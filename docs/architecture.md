# Ledge — Architecture Spec
> Agent context document. Read this before writing any code. Pairs with `product.md` (features) and `design.md` (UI/visual system).

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Mobile | React Native (Expo) | iOS first. Talks only to the backend API — no direct Supabase data calls, no direct Drizzle, no direct Plaid calls except the on-device Link SDK handshake |
| Styling | NativeWind (TailwindCSS for RN) | |
| Components | shadcn/ui RN port (`@shadcn/ui` + `react-native-reusables`) | |
| Backend | Node.js + Fastify + TypeScript | Single API surface. Owns **all** data access and **all** Plaid calls |
| API layer | tRPC | End-to-end types between backend and RN client, since both are TypeScript |
| Auth | Supabase Auth (Google only) | Mobile signs in directly against Supabase Auth (the one thing that stays direct); backend verifies the resulting JWT on every request. Google is the sole identity provider — the Email provider is disabled, so there is no password path |
| DB | Supabase Postgres | Accessed exclusively through the backend |
| ORM / Migrations | Drizzle ORM + Drizzle Kit | Schema lives in the backend; mobile never touches the DB directly |
| Financial data | Plaid API | All calls (Link token creation, token exchange, transactions/sync, accounts/get) happen server-side in the backend, using **per-user** credentials (see BYOK below) |
| Local cache | MMKV or Expo SQLite | Transactions cached on-device, relayed through the backend but never persisted server-side |
| Secure storage | Expo SecureStore | Session + Plaid access token cached on-device |
| Hosting (backend) | Railway, Fly.io, or Render | Any works for a small always-on Node service; no strong preference |

---

## Core Principle: Data Privacy

Raw financial data (transactions, balances, account numbers) **never persists in the backend database**. Only user-defined metadata lives in Postgres. The backend acts as a stateless relay for Plaid data: it calls Plaid, returns the JSON straight to the client, and never writes transaction/balance bodies to any table.

## Why Plaid calls can't be client-side

Almost all Plaid API endpoints — including `/transactions/sync` itself, not just token exchange — require `client_id` and `secret` on every request, sent either in the request body or in `PLAID-CLIENT-ID`/`PLAID-SECRET` headers. There is no lightweight "access-token-only" mode. The only thing that ever runs purely on-device is the Plaid Link SDK's bank-authentication handshake, which produces a `public_token`; every actual data-fetching call (link token creation, token exchange, transactions sync, accounts/balances) is a backend-to-backend call requiring the secret. This is why **all** Plaid calls live in the backend, never in the mobile app.

## Why credentials are per-user (BYOK)

Rather than one shared app-wide Plaid `client_id`/`secret`, each user brings their own, obtained free from their own Plaid dashboard account. This avoids sharing Plaid's Trial-plan Item limits (10 Production Items per Plaid team) across the whole friend group, and isolates each person's usage/billing under their own Plaid account. The tradeoff: if one user's Plaid account lapses or misconfigures, only their sync breaks — errors need to surface clearly in-app since there's no shared dashboard to debug from.

---

## Auth Model: JWT verification + RLS as defense-in-depth

Even though the backend is a single API surface that owns all data access, Postgres Row-Level Security stays enabled on every table. This means a bug in the backend's own authorization logic can't leak another user's row — it's a second, independent enforcement layer, not a redundant one.

- Mobile signs in via Supabase Auth directly and receives a JWT. Sign-in is native Google Sign-In: the `@react-native-google-signin/google-signin` SDK returns a Google ID token, which is exchanged for a Supabase session via `signInWithIdToken`. No browser round-trip and no deep link — the `ledge://` scheme and the associated domain are Plaid's, not auth's. Supabase validates the ID token's `aud` against the **Web** OAuth client configured on its Google provider, which is why the app passes a `webClientId` alongside the `iosClientId` it actually signs in with.
- There is no separate signup screen or flow: a first Google sign-in creates the account. Nothing enforces the "invite-only" framing in the product copy — any Google account can currently sign up.
- Every request to the backend carries that JWT in `Authorization: Bearer <token>`.
- A `requireAuth` middleware verifies the JWT against the Supabase JWT secret and extracts `user_id`.
- **Ordinary CRUD** (categories, budgets, vendor mappings, manual transactions, reimbursements, overrides): the backend uses a **per-request Supabase client re-authenticated with that same user JWT**, so RLS (`auth.uid() = user_id`) enforces the boundary at the database layer.
- **Privileged operations** (decrypting `plaid_credentials.encrypted_secret`, decrypting `plaid_items.encrypted_access_token`): the backend uses a **service-role Drizzle connection**, since decryption logic can't be expressed by RLS. These are the only code paths that bypass RLS — narrow, explicit, and limited to two repositories.

### Where RLS actually comes from

Migration `backend/drizzle/0001_enable_rls_user_scoped_tables.sql` is what establishes it. That migration enables RLS and creates one policy per user-scoped table:

```sql
CREATE POLICY <table>_owner ON public.<table> FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

`USING` governs which existing rows a statement can see, which is what scopes reads and simultaneously stops an `update`/`delete` that matches only on `id` from touching another user's row. `WITH CHECK` governs rows being written, which is what stops a user from inserting or re-assigning a row under someone else's `user_id`. Both clauses are required; `USING` alone leaves the write path open.

Two properties of Postgres make this the load-bearing layer rather than a redundant one, and make its absence silent:

1. **RLS is opt-in per table.** A table with RLS disabled applies no filtering whatsoever — it does not fail closed. Supabase separately grants the `authenticated` role table-level CRUD on `public` tables by default, so a table that is missing its policy is readable and writable by *every* signed-in user. This is not hypothetical: tables were created in migration 0000 with no policies, and the deployed database was confirmed to have `relrowsecurity = false` and zero policies on all eleven of its public tables — every user could read and modify every other user's rows until 0001 was applied.

   Note the eleventh: `manual_accounts` exists in the deployed database but in neither `schema.ts` nor any migration. Migration 0001 covers it explicitly and skips tables that aren't present, but the drift itself is unresolved — anything generated from `schema.ts` is blind to that table.
2. **The repositories have no `user_id` predicate of their own.** They issue bare `select`/`update`/`delete` calls (see `manualTransactionRepository.list`) and rely entirely on the policy to narrow the result. There is currently no second layer in application code, so a missing policy is an immediate data leak, not a degraded defense.

**Any new user-scoped table therefore needs its policy added in the same migration that creates it.** Verify the live state with:

```sql
select tablename, policyname, qual from pg_policies where schemaname = 'public';
select relname, relrowsecurity from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;
```

The second query must return zero rows. Note that policies are *permissive* and OR together, so an extra hand-added policy on a table widens access rather than narrowing it — audit `qual` rather than just counting policies.

### The on-device boundary

RLS only governs data crossing the network. The mobile app holds a **single `QueryClient` created once in `app/_layout.tsx`**, which outlives any individual session, so cross-user leakage is possible entirely on-device: sign out, sign in as someone else without restarting the app, and the previous user's cached query results render for the new one. No request reaches Postgres on that path, so no database policy can prevent it.

`useResetCacheOnUserChange` (wired in `app/_layout.tsx`) closes this by emptying the cache whenever the signed-in user changes. It subscribes to `onAuthStateChange` rather than hooking the Sign Out button, so it also covers sessions that end without the user tapping anything — refresh-token failure, expiry. The decision rule is pure and unit-tested in `lib/auth/shouldResetCache.ts`: it deliberately ignores the first event after mount (the cache is empty, and clearing would discard the session's first fetch) and events that leave the user id unchanged (`TOKEN_REFRESHED` fires on a timer all session long).

**Any future client-side store holding user data needs the same treatment.** The MMKV transaction cache (`lib/storage/mmkv.ts`) is currently safe by construction rather than by reset: it keys on Plaid `item_id`, and `plaidItemRepository` scopes items to the calling user, so one user never requests another's keys. It does, however, retain a signed-out user's transactions on disk until those keys are overwritten.

---

## Data Flow

```
Device                    Backend API                    Supabase Postgres         Plaid
  |
  |-- auth (Google ID token) ----------------------------------------------------->|  (direct to Supabase Auth)
  |<- JWT session ------------------------------------------------------------------|
  |
  |-- POST /plaidCredentials.save (JWT) -------------------->|
  |   { client_id, secret, environment }                      |
  |                                                            |-- validate against Plaid (cheap test call)
  |                                                            |-- AES-256 encrypt secret
  |                                                            |-- upsert plaid_credentials (service-role)
  |<- 200 OK -------------------------------------------------|
  |
  |-- Plaid Link (SDK, on-device) ------------------------------------------------------------------------>|
  |<- public_token ------------------------------------------------------------------------------------------|
  |
  |-- POST /plaid.exchangeToken (JWT, public_token) --------->|
  |                                                            |-- decrypt user's client_id/secret (service-role, plaid_credentials)
  |                                                            |-- item/public_token/exchange ------------------------------------------->|
  |                                                            |<- access_token -----------------------------------------------------------|
  |                                                            |-- AES-256 encrypt + write plaid_items (service-role)
  |<- 200 OK ---------------------------------------------------|
  |
  |-- GET /transactions.sync?cursor=... (JWT) ----------------->|
  |                                                              |-- decrypt creds, call /transactions/sync ------------------------------->|
  |                                                              |<- raw transactions ------------------------------------------------------|
  |<- raw transactions (relayed only, never persisted) ---------|
  |   cached in MMKV/SQLite on device
  |
  |-- categories.update / budgets.update / etc. (JWT) ---------->|  (user-scoped Supabase client, RLS-enforced, persisted)
```

---

## What Lives Where

| Data | Location | Rationale |
|---|---|---|
| Raw transactions (Plaid) | Device only (MMKV/SQLite cache) | Never persisted server-side |
| Manual transactions | Backend DB (`manual_transactions`) | No external source to re-fetch from; user-entered only |
| Account balances | Device only (in-memory, relayed live) | Never persisted server-side |
| Plaid access token | Backend DB (`plaid_items`, AES-256 encrypted) | Encrypted at rest; never reaches the device, which only ever handles the short-lived `public_token` during the Link handshake. Because it is server-side, a reinstall does not require relinking |
| Supabase session (refresh + access token) | Device Keychain (SecureStore) | The only thing in SecureStore. Note iOS keeps Keychain items across an uninstall, so the app clears the session on first launch after a reinstall (`usePurgeSessionOnFreshInstall`) |
| Plaid client_id / secret (BYOK) | Backend DB (`plaid_credentials`, secret AES-256 encrypted) | Per-user credential, decrypted only inside the backend for outbound Plaid calls |
| User account | Supabase Auth (Google identity) | Auth only. No password is ever stored or handled — the Email provider is disabled |
| Categories + subcategories | Backend DB | Low sensitivity |
| Vendor → category mappings | Backend DB | Low sensitivity |
| Budgets | Backend DB | Low sensitivity |
| Reimbursement links | Backend DB (transaction IDs only, no amounts pulled from Plaid) | Transaction IDs are opaque strings |

---

## Database Schema

### `users`
Managed by Supabase Auth. No custom columns needed beyond defaults.

### `plaid_credentials`
```sql
id                    uuid PRIMARY KEY
user_id               uuid REFERENCES auth.users UNIQUE
client_id             text
encrypted_secret      text        -- AES-256, same key/scheme as encrypted_access_token
environment           text        -- 'sandbox' | 'development' | 'production'
created_at            timestamptz
```
RLS enabled with `auth.uid() = user_id`. Only the service-role credential repository ever reads `encrypted_secret` in plaintext; RLS remains on so a stray user-scoped query still can't read another user's row. Plaid Link is gated in the UI on this row's existence.

### `plaid_items`
```sql
id                       uuid PRIMARY KEY
user_id                  uuid REFERENCES auth.users
institution_id           text
institution_name         text
encrypted_access_token   text   -- AES-256 encrypted
item_id                  text
created_at               timestamptz
```

### `categories`
```sql
id          uuid PRIMARY KEY
user_id     uuid REFERENCES auth.users
name        text
color       text               -- hex color for UI
icon        text               -- icon name
created_at  timestamptz
```

### `subcategories`
```sql
id            uuid PRIMARY KEY
user_id       uuid REFERENCES auth.users
category_id   uuid REFERENCES categories
name          text
created_at    timestamptz
```

### `plaid_category_mappings`
```sql
id                   uuid PRIMARY KEY
user_id              uuid REFERENCES auth.users
plaid_pfc_primary    text     -- e.g. 'FOOD_AND_DRINK'
plaid_pfc_detailed   text     -- e.g. 'FOOD_AND_DRINK_COFFEE' (nullable)
category_id          uuid REFERENCES categories
created_at           timestamptz

UNIQUE(user_id, plaid_pfc_primary, plaid_pfc_detailed)
```
Rules:
- **Many-to-one**: multiple PFC codes can map to the same Ledge category
- **One-to-one constraint**: a single PFC code cannot map to multiple Ledge categories
- **Detailed overrides primary**: a detailed mapping takes precedence over a primary-only mapping
- **Required on category create/edit**: every Ledge category must have at least one PFC code assigned — enforced in UI
- Seeded on onboarding from the default mapping table (see `product.md`); user can edit via Settings → Categories
- Used as fallback categorization for new vendors with no existing `vendor_mapping`

### `vendor_mappings`
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES auth.users
vendor_name     text           -- normalized Plaid merchant_name
category_id     uuid REFERENCES categories
subcategory_id  uuid REFERENCES subcategories (nullable)
source          text           -- 'plaid_auto' | 'user_defined'
created_at      timestamptz
```
Seeded on first sync using Plaid's `personal_finance_category.primary`/`.detailed` → user's `plaid_category_mappings`. When a user manually recategorizes a transaction, upsert with `source='user_defined'`, overriding any prior `plaid_auto` entry. All future transactions from that vendor are auto-categorized client-side at render time.

### `manual_transactions`
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES auth.users
amount          numeric(12,2)       -- always positive
type            text                -- 'expense' | 'income'
category_id     uuid REFERENCES categories (nullable)
subcategory_id  uuid REFERENCES subcategories (nullable)
date            date
note            text (nullable)
created_at      timestamptz
updated_at      timestamptz
```
Manually entered transactions with no Plaid counterpart. Stored server-side (unlike Plaid transactions) since there is no external source to re-fetch them from. Displayed in the transaction feed mixed with Plaid transactions. Can be linked as either the expense or the reimbursement side of a reimbursement pair.

### `transaction_overrides`
```sql
id                   uuid PRIMARY KEY
user_id              uuid REFERENCES auth.users
plaid_transaction_id text          -- opaque ID from Plaid
category_id          uuid REFERENCES categories (nullable)
subcategory_id       uuid REFERENCES subcategories (nullable)
created_at           timestamptz
```
Per-transaction manual overrides that differ from the vendor default.

### `budgets`
```sql
id              uuid PRIMARY KEY
user_id         uuid REFERENCES auth.users
category_id     uuid REFERENCES categories
amount          numeric(12,2)
period          text           -- 'monthly' | 'weekly' | 'yearly'
created_at      timestamptz
```

### `reimbursements`
```sql
id                              uuid PRIMARY KEY
user_id                         uuid REFERENCES auth.users

-- Expense side (the bill that was paid): one of these two is set, not both
expense_plaid_transaction_id    text (nullable)
expense_manual_transaction_id   uuid REFERENCES manual_transactions (nullable)

-- Reimbursement side (the incoming payment): one of these two is set, not both
income_plaid_transaction_id     text (nullable)
income_manual_transaction_id    uuid REFERENCES manual_transactions (nullable)

amount          numeric(12,2)   -- reimbursed amount (may be partial)
note            text (nullable)
created_at      timestamptz

CHECK (
  (expense_plaid_transaction_id IS NOT NULL) != (expense_manual_transaction_id IS NOT NULL)
  AND
  (income_plaid_transaction_id IS NOT NULL) != (income_manual_transaction_id IS NOT NULL)
)
```
Supports all four combinations: Plaid expense ↔ Plaid income, Plaid expense ↔ manual income (cash reimbursement), manual expense ↔ Plaid income, manual expense ↔ manual income (fully cash). Net expense = original amount − sum of linked reimbursement amounts.

---

## Backend API Surface (tRPC routers)

- `plaidCredentials` — `save`, `test`, `get` (masked)
- `plaidLink` — `createLinkToken`, `exchangeToken`
- `transactions` — `sync` (cursor-based, relays Plaid data, no persistence)
- `accounts` — `list` (balances, relayed live)
- `categories` — CRUD
- `subcategories` — CRUD
- `plaidCategoryMappings` — CRUD
- `vendorMappings` — CRUD, bulk recategorize
- `manualTransactions` — CRUD
- `transactionOverrides` — CRUD
- `budgets` — CRUD, spend calculations
- `reimbursements` — CRUD, net expense calculation
- `onboarding` — category seeding + initial vendor-mapping generation

---

## Architecture Layers

Strict one-way dependency rule on both mobile and backend: **Components → Hooks → API client → (network boundary) → Routers → Services → Repositories → Data clients**. No layer may skip a level or import from a layer above it.

| Layer | Location | Responsibility |
|---|---|---|
| **Components** (mobile) | `components/` | Pure UI. Call hooks only. Zero business logic. |
| **Hooks** (mobile) | `hooks/` | React state + side effects. Call the tRPC API client only. Expose `{ data, isLoading, error }` to components. |
| **API client** (mobile) | `lib/api/client.ts` | tRPC client, injects the Supabase JWT on every call. |
| **Routers** (backend) | `src/routers/` | Thin handlers — parse input, call one service, return output. No business logic, no direct DB/Plaid calls. |
| **Services** (backend) | `src/services/` | Business logic. Orchestrate across multiple repositories. No DB or Plaid calls directly. |
| **Repositories** (backend) | `src/repositories/` | Data access only. One file per domain entity. All Drizzle queries, Supabase-client calls, and Plaid API calls live here. No business logic. |
| **Data clients** (backend) | `src/lib/db/`, `src/lib/plaid/`, `src/lib/crypto/`, `src/lib/supabase/` | Client instantiation and configuration only. No queries, no logic. |

Plaid is treated as a remote read-only data source — `repositories/transactionRepository.ts` wraps all Plaid API calls the same way other repos wrap Drizzle/Supabase.

---

## File Structure

```
ledge/
│
├── app/                                  # Expo Router — screens only, no logic
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx                     # Sole auth screen — Google sign-in doubles as signup
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx                     # Dashboard screen
│   │   ├── transactions.tsx              # Transaction feed screen
│   │   ├── budgets.tsx                   # Budgets screen
│   │   └── settings/
│   │       ├── _layout.tsx
│   │       ├── index.tsx                 # Settings index
│   │       ├── plaid-account.tsx         # BYOK: Plaid developer credentials
│   │       ├── accounts.tsx              # Linked Plaid items
│   │       └── categories.tsx            # Category CRUD
│   └── _layout.tsx
│
├── components/                           # Pure UI components — no hooks, no services
│   ├── ui/                               # shadcn/react-native-reusables primitives
│   ├── transactions/
│   │   ├── TransactionItem.tsx
│   │   ├── TransactionList.tsx
│   │   └── CategorySheet.tsx
│   ├── budgets/
│   │   ├── BudgetCard.tsx
│   │   └── BudgetProgressBar.tsx
│   ├── categories/
│   │   ├── CategoryBadge.tsx
│   │   ├── CategoryPicker.tsx
│   │   └── PlaidPfcPicker.tsx
│   ├── reimbursements/
│   │   └── ReimbursementSheet.tsx
│   ├── plaid/
│   │   └── PlaidCredentialsForm.tsx       # BYOK client_id/secret/environment form
│   └── dashboard/
│       ├── SpendingSummary.tsx
│       └── DonutChart.tsx
│
├── hooks/                                # React state + side effects; call the API client only
│   ├── useTransactions.ts
│   ├── useCategories.ts
│   ├── useBudgets.ts
│   ├── useReimbursements.ts
│   ├── useAccounts.ts
│   ├── usePlaidCredentials.ts
│   └── useOnboarding.ts
│
├── lib/
│   ├── api/
│   │   └── client.ts                     # tRPC client, injects Supabase JWT
│   ├── storage/
│   │   ├── mmkv.ts
│   │   └── sqlite.ts
│   └── supabase/
│       └── auth.ts                       # Auth only: Google sign-in, session, refresh — no data queries
│
├── types/                                 # Shared types, ideally imported from the backend package
│   ├── domain.ts
│   └── index.ts
│
└── constants/
    ├── theme.ts
    └── plaid.ts

backend/
├── src/
│   ├── server.ts                          # Fastify instance + tRPC adapter
│   ├── middleware/
│   │   └── requireAuth.ts                 # verifies Supabase JWT, attaches userId + scoped client
│   ├── routers/
│   │   ├── plaidCredentials.ts
│   │   ├── plaidLink.ts                   # linkToken.create, exchangeToken
│   │   ├── transactions.ts                # sync
│   │   ├── accounts.ts
│   │   ├── categories.ts
│   │   ├── subcategories.ts
│   │   ├── plaidCategoryMappings.ts
│   │   ├── vendorMappings.ts
│   │   ├── manualTransactions.ts
│   │   ├── transactionOverrides.ts
│   │   ├── budgets.ts
│   │   └── reimbursements.ts
│   ├── services/
│   │   ├── plaidCredentialService.ts
│   │   ├── transactionSyncService.ts
│   │   ├── categorizationService.ts
│   │   ├── onboardingService.ts
│   │   ├── budgetService.ts
│   │   └── reimbursementService.ts
│   ├── repositories/
│   │   ├── plaidCredentialRepository.ts   # service-role, encrypt/decrypt
│   │   ├── plaidItemRepository.ts         # service-role, encrypt/decrypt
│   │   ├── categoryRepository.ts          # user-scoped client
│   │   ├── subcategoryRepository.ts       # user-scoped client
│   │   ├── plaidCategoryMappingRepository.ts # user-scoped client
│   │   ├── vendorMappingRepository.ts     # user-scoped client
│   │   ├── manualTransactionRepository.ts # user-scoped client
│   │   ├── transactionOverrideRepository.ts # user-scoped client
│   │   ├── budgetRepository.ts            # user-scoped client
│   │   └── reimbursementRepository.ts     # user-scoped client
│   └── lib/
│       ├── db/
│       │   ├── client.ts                  # Drizzle, service-role Postgres connection
│       │   └── schema.ts                  # single source of truth
│       ├── plaid/
│       │   ├── client.ts                  # Plaid SDK factory, instantiated per-request with decrypted per-user creds
│       │   └── pfc.ts                     # full PFC taxonomy + default Ledge mapping table
│       ├── crypto/
│       │   └── aes.ts                     # AES-256 encrypt/decrypt for secrets + access tokens
│       └── supabase/
│           ├── serviceClient.ts           # service-role client (bypasses RLS) — used only by the two credential repos above
│           └── scopedClient.ts            # factory: new client per request, authenticated with the caller's JWT (RLS applies)
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

---

## Environment Variables

```
# Backend (.env — never shipped to the mobile bundle)
DATABASE_URL=                        # Supabase Postgres connection string (service-role)
SUPABASE_URL=
SUPABASE_ANON_KEY=                   # used to build per-request scoped clients
SUPABASE_JWT_SECRET=                 # to verify incoming JWTs
ACCESS_TOKEN_ENCRYPTION_KEY=         # 32-byte hex AES-256 key — encrypts both plaid_items.encrypted_access_token and plaid_credentials.encrypted_secret
AXIOM_TOKEN=                         # optional, with AXIOM_DATASET — durable request + error log sink; unset = stdout only
AXIOM_DATASET=                       # tofi-backend — matches the `service` field on every event

# Mobile (.env — safe to bundle)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=                 # backend base URL
```

Note: `PLAID_CLIENT_ID` / `PLAID_SECRET` no longer exist as global env vars — they are per-user, stored only in `plaid_credentials`, decrypted per-request inside the backend.

---

## Key Engineering Constraints

1. **Strict layering** — see Architecture Layers above. A component that imports a repository/service directly, or a router that queries the DB directly, is a bug.
2. **Drizzle is the schema source of truth** — all table definitions live in `backend/src/lib/db/schema.ts`. Never write raw `CREATE TABLE` SQL by hand; always use Drizzle Kit migrations generated from the schema. *Exception:* RLS policies are not expressible in the schema file at the pinned `drizzle-orm` version, so they live in a hand-written migration authored via `npx drizzle-kit generate --custom` (which creates the journal entry and snapshot for you). `0001_enable_rls_user_scoped_tables.sql` is that migration — it is not a violation of this rule.
3. **All Plaid calls happen in the backend**, using the calling user's decrypted `client_id`/`secret` from `plaid_credentials`. The mobile app never talks to `*.plaid.com` directly except through the on-device Link SDK's bank-auth handshake.
4. **Transaction IDs only** are stored server-side (in `reimbursements` and `transaction_overrides`). Never store amounts, merchant names, or account details server-side, except where explicitly noted below.
5. **Reimbursement amounts** are the one exception to constraint 4 — stored in the `reimbursements` table because they're user-entered, not pulled from Plaid.
6. **Row-Level Security (RLS)** is enabled on every table by migration `0001_enable_rls_user_scoped_tables.sql`, and **a new user-scoped table is not finished until its policy ships in the same migration that creates it** — RLS is opt-in per table and fails *open*, so a forgotten policy exposes the table to every signed-in user. Ordinary CRUD goes through a per-request user-scoped Supabase client so RLS enforces `auth.uid() = user_id`; only the `plaidCredentialRepository` and `plaidItemRepository` use a service-role connection, and only to decrypt/encrypt secrets. See "Where RLS actually comes from" above for the policy shape and the audit queries.
7. **The user boundary is enforced on-device too, not only by RLS.** The `QueryClient` is a single long-lived instance, so any client-side store holding user data must be dropped when the signed-in user changes (`useResetCacheOnUserChange`) — otherwise an account switch renders the previous user's data with no request ever reaching Postgres. See "The on-device boundary" above.
8. **Design tokens are the only source of truth** — all colors, font sizes, spacing, and radii come from `constants/theme.ts` on mobile. Hardcoded values like `#fff`, `16`, or `'Inter'` anywhere outside that file are a bug.
9. **NativeWind** requires the Babel plugin. Use `className` props as in web Tailwind, driven by the same token file (see `tailwind.config.js` derivation in `design.md`).
10. **No `<form>` tags** — use controlled inputs with `onChangeText` / `onPress` handlers throughout.
11. **Never persist raw Plaid transaction/balance data server-side.** Sync and accounts endpoints are stateless relays.
12. **BYOK is mandatory, not optional.** There is no fallback shared Plaid key; the UI must gate Plaid Link behind the existence of a `plaid_credentials` row for the current user.

---

## Out of Scope (v1) — Architecture-Relevant

- Android support (iOS first)
- Shared/joint budgets (would require multi-user RLS policies beyond `auth.uid() = user_id`)
- A shared/fallback Plaid credential path
- Server-side persistence of any Plaid-sourced transaction or balance data
