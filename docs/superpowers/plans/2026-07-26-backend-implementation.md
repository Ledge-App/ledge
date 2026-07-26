# Ledge Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full backend surface described in `docs/architecture.md` — Fastify + tRPC server, Drizzle schema, auth middleware, and every router/service/repository — with no mobile app work yet.

**Architecture:** Strict layering per `architecture.md` — Routers (thin, parse input, call one service) → Services (business logic, orchestrate repositories) → Repositories (all Drizzle/Supabase/Plaid I/O, one file per entity) → Data clients (`lib/db`, `lib/plaid`, `lib/crypto`, `lib/supabase`, instantiation only). No layer skips a level or imports from above it. Ordinary CRUD uses a per-request Supabase client scoped to the caller's JWT (RLS enforced); only `plaidCredentialRepository` and `plaidItemRepository` use a service-role Drizzle connection, to decrypt/encrypt secrets.

**Tech Stack:** Node.js, TypeScript (strict), Fastify, `@trpc/server` (fastify adapter), Drizzle ORM + Drizzle Kit (schema/migrations), `@supabase/supabase-js` (scoped + service-role clients), `plaid` (official Node SDK), `jsonwebtoken` (verify Supabase JWTs), Node `crypto` (AES-256-GCM), Zod (input validation), Vitest (tests, with `vi.mock` for I/O boundaries).

## Global Constraints

- **Never persist raw Plaid transaction/balance data server-side.** `transactions.sync` and `accounts.list` are stateless relays — no table write.
- **Transaction IDs only** are stored server-side (in `reimbursements` and `transaction_overrides`) — never amounts/merchant/account details pulled from Plaid, except `reimbursements.amount` (user-entered).
- **RLS stays on for every table.** Ordinary CRUD repositories take a per-request Supabase client authenticated with the caller's JWT. Only `plaidCredentialRepository` and `plaidItemRepository` use the service-role client, and only to encrypt/decrypt secrets.
- **Drizzle `schema.ts` is the single source of truth** for table shape; migrations are generated via Drizzle Kit, never hand-written SQL.
- **BYOK is mandatory** — no fallback shared Plaid credential path anywhere in the backend.
- **Routers contain no business logic and no direct DB/Plaid calls** — they parse input with Zod and call exactly one service method.
- **Services never import a data client directly** (`lib/db`, `lib/plaid`, `lib/supabase`) — only repositories do.
- Every task's tests use Vitest with `vi.mock` to stub the layer directly below the unit under test — repository tests mock the DB/Supabase/Plaid client; service tests mock repositories; router tests mock services.
- Money fields are `numeric(12,2)` in Postgres, represented as `string` in TypeScript (Drizzle's default for `numeric`) to avoid float rounding — services parse with a shared `toCents`/`fromCents` helper before arithmetic.

---

## File Structure

```
backend/
├── src/
│   ├── server.ts
│   ├── middleware/
│   │   └── requireAuth.ts
│   ├── trpc/
│   │   ├── context.ts
│   │   ├── trpc.ts
│   │   └── router.ts
│   ├── routers/
│   │   ├── plaidCredentials.ts
│   │   ├── plaidLink.ts
│   │   ├── transactions.ts
│   │   ├── accounts.ts
│   │   ├── categories.ts
│   │   ├── subcategories.ts
│   │   ├── plaidCategoryMappings.ts
│   │   ├── vendorMappings.ts
│   │   ├── manualTransactions.ts
│   │   ├── transactionOverrides.ts
│   │   ├── budgets.ts
│   │   ├── reimbursements.ts
│   │   └── onboarding.ts
│   ├── services/
│   │   ├── plaidCredentialService.ts
│   │   ├── plaidLinkService.ts
│   │   ├── transactionSyncService.ts
│   │   ├── categorizationService.ts
│   │   ├── onboardingService.ts
│   │   ├── budgetService.ts
│   │   └── reimbursementService.ts
│   ├── repositories/
│   │   ├── plaidCredentialRepository.ts
│   │   ├── plaidItemRepository.ts
│   │   ├── transactionRepository.ts
│   │   ├── accountRepository.ts
│   │   ├── categoryRepository.ts
│   │   ├── subcategoryRepository.ts
│   │   ├── plaidCategoryMappingRepository.ts
│   │   ├── vendorMappingRepository.ts
│   │   ├── manualTransactionRepository.ts
│   │   ├── transactionOverrideRepository.ts
│   │   ├── budgetRepository.ts
│   │   └── reimbursementRepository.ts
│   └── lib/
│       ├── db/
│       │   ├── client.ts
│       │   └── schema.ts
│       ├── plaid/
│       │   ├── client.ts
│       │   └── pfc.ts
│       ├── crypto/
│       │   └── aes.ts
│       ├── money.ts
│       └── supabase/
│           ├── serviceClient.ts
│           └── scopedClient.ts
├── drizzle/                      # generated migrations
├── drizzle.config.ts
├── vitest.config.ts
├── package.json
├── tsconfig.json
└── .env.example
```

---

### Task 1: Project scaffolding

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test`, `db:generate`, `db:migrate` that every later task's steps assume exist.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "ledge-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "@supabase/supabase-js": "^2.45.4",
    "@trpc/server": "^10.45.2",
    "dotenv": "^16.4.5",
    "drizzle-orm": "^0.33.0",
    "fastify": "^4.28.1",
    "jsonwebtoken": "^9.0.2",
    "plaid": "^28.0.0",
    "postgres": "^3.4.4",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.14.15",
    "drizzle-kit": "^0.24.2",
    "tsx": "^4.19.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
})
```

- [ ] **Step 4: Write `.env.example`**

```
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_JWT_SECRET=
ACCESS_TOKEN_ENCRYPTION_KEY=
PORT=3000
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules
dist
.env
```

- [ ] **Step 6: Install dependencies**

Run: `cd backend && npm install`
Expected: lockfile created, no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/tsconfig.json backend/vitest.config.ts backend/.env.example backend/.gitignore
git commit -m "chore: scaffold backend project"
```

---

### Task 2: Money helper

**Files:**
- Create: `backend/src/lib/money.ts`
- Test: `backend/src/lib/money.test.ts`

**Interfaces:**
- Produces: `toCents(amount: string): number`, `fromCents(cents: number): string` — used by every service doing arithmetic on `numeric(12,2)` columns (budgetService, reimbursementService).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { fromCents, toCents } from './money.js'

describe('money', () => {
  it('converts a decimal string to integer cents', () => {
    expect(toCents('127.40')).toBe(12740)
    expect(toCents('0.00')).toBe(0)
    expect(toCents('100')).toBe(10000)
  })

  it('converts integer cents back to a fixed 2-decimal string', () => {
    expect(fromCents(12740)).toBe('127.40')
    expect(fromCents(0)).toBe('0.00')
    expect(fromCents(4000)).toBe('40.00')
  })

  it('round-trips without drift', () => {
    expect(fromCents(toCents('19.99'))).toBe('19.99')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/lib/money.test.ts`
Expected: FAIL — `money.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export function toCents(amount: string): number {
  const [whole, fraction = '0'] = amount.split('.')
  const paddedFraction = (fraction + '00').slice(0, 2)
  const sign = whole.startsWith('-') ? -1 : 1
  return sign * (Math.abs(Number(whole)) * 100 + Number(paddedFraction))
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const fraction = String(abs % 100).padStart(2, '0')
  return `${sign}${whole}.${fraction}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/lib/money.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/money.ts backend/src/lib/money.test.ts
git commit -m "feat: add money cents<->decimal helper"
```

---

### Task 3: AES-256-GCM crypto lib

**Files:**
- Create: `backend/src/lib/crypto/aes.ts`
- Test: `backend/src/lib/crypto/aes.test.ts`

**Interfaces:**
- Consumes: `process.env.ACCESS_TOKEN_ENCRYPTION_KEY` (32-byte hex string).
- Produces: `encrypt(plaintext: string): string`, `decrypt(ciphertext: string): string` — used by `plaidCredentialRepository` and `plaidItemRepository` (Task 7) to encrypt `plaid_credentials.encrypted_secret` and `plaid_items.encrypted_access_token`.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { decrypt, encrypt } from './aes.js'

beforeAll(() => {
  process.env.ACCESS_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64) // 32 bytes hex
})

describe('aes', () => {
  it('encrypts and decrypts back to the original plaintext', () => {
    const plaintext = 'sk_live_super_secret_plaid_key'
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toBe(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('produces different ciphertext for the same plaintext each call (random IV)', () => {
    const a = encrypt('same-input')
    const b = encrypt('same-input')
    expect(a).not.toBe(b)
  })

  it('throws on tampered ciphertext', () => {
    const ciphertext = encrypt('tamper-me')
    const tampered = ciphertext.slice(0, -2) + 'zz'
    expect(() => decrypt(tampered)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/lib/crypto/aes.test.ts`
Expected: FAIL — `aes.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

function getKey(): Buffer {
  const hex = process.env.ACCESS_TOKEN_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('ACCESS_TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 chars)')
  }
  return Buffer.from(hex, 'hex')
}

// Stored format: base64(iv) . base64(authTag) . base64(ciphertext)
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.')
}

export function decrypt(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split('.')
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Malformed ciphertext')
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ])
  return plaintext.toString('utf8')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/lib/crypto/aes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/crypto/aes.ts backend/src/lib/crypto/aes.test.ts
git commit -m "feat: add AES-256-GCM encrypt/decrypt helper"
```

---

### Task 4: Drizzle schema (all tables)

**Files:**
- Create: `backend/src/lib/db/schema.ts`
- Create: `backend/drizzle.config.ts`
- Test: `backend/src/lib/db/schema.test.ts`

**Interfaces:**
- Produces: exported Drizzle table objects `plaidCredentials`, `plaidItems`, `categories`, `subcategories`, `plaidCategoryMappings`, `vendorMappings`, `manualTransactions`, `transactionOverrides`, `budgets`, `reimbursements` — every repository task (5, 7–13) imports these by name and column.
- Consumes: nothing (root of the DB layer).

- [ ] **Step 1: Write the failing test**

This test only checks the schema module has the shape later tasks depend on (no live DB needed).

```ts
import { describe, expect, it } from 'vitest'
import * as schema from './schema.js'

describe('schema', () => {
  it('exports every table required by architecture.md', () => {
    const tableNames = [
      'plaidCredentials',
      'plaidItems',
      'categories',
      'subcategories',
      'plaidCategoryMappings',
      'vendorMappings',
      'manualTransactions',
      'transactionOverrides',
      'budgets',
      'reimbursements',
    ] as const
    for (const name of tableNames) {
      expect(schema[name]).toBeDefined()
    }
  })

  it('gives categories a color and icon column', () => {
    expect(schema.categories.color).toBeDefined()
    expect(schema.categories.icon).toBeDefined()
  })

  it('gives reimbursements the four nullable linkage columns', () => {
    expect(schema.reimbursements.expensePlaidTransactionId).toBeDefined()
    expect(schema.reimbursements.expenseManualTransactionId).toBeDefined()
    expect(schema.reimbursements.incomePlaidTransactionId).toBeDefined()
    expect(schema.reimbursements.incomeManualTransactionId).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/lib/db/schema.test.ts`
Expected: FAIL — `schema.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
import { sql } from 'drizzle-orm'
import {
  check,
  date,
  numeric,
  pgSchema,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

// Supabase's auth.users table, referenced for FKs only — never written to by this app.
const authSchema = pgSchema('auth')
export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
})

export const plaidCredentials = pgTable('plaid_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id).unique(),
  clientId: text('client_id').notNull(),
  encryptedSecret: text('encrypted_secret').notNull(),
  environment: text('environment').notNull(), // 'sandbox' | 'development' | 'production'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const plaidItems = pgTable('plaid_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  institutionId: text('institution_id').notNull(),
  institutionName: text('institution_name').notNull(),
  encryptedAccessToken: text('encrypted_access_token').notNull(),
  itemId: text('item_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  name: text('name').notNull(),
  color: text('color').notNull(),
  icon: text('icon').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const subcategories = pgTable('subcategories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const plaidCategoryMappings = pgTable('plaid_category_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  plaidPfcPrimary: text('plaid_pfc_primary').notNull(),
  plaidPfcDetailed: text('plaid_pfc_detailed'),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniquePfc: unique().on(table.userId, table.plaidPfcPrimary, table.plaidPfcDetailed),
}))

export const vendorMappings = pgTable('vendor_mappings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  vendorName: text('vendor_name').notNull(),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  subcategoryId: uuid('subcategory_id').references(() => subcategories.id),
  source: text('source').notNull(), // 'plaid_auto' | 'user_defined'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const manualTransactions = pgTable('manual_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  type: text('type').notNull(), // 'expense' | 'income'
  categoryId: uuid('category_id').references(() => categories.id),
  subcategoryId: uuid('subcategory_id').references(() => subcategories.id),
  date: date('date').notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const transactionOverrides = pgTable('transaction_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  plaidTransactionId: text('plaid_transaction_id').notNull(),
  categoryId: uuid('category_id').references(() => categories.id),
  subcategoryId: uuid('subcategory_id').references(() => subcategories.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  period: text('period').notNull(), // 'monthly' | 'weekly' | 'yearly'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const reimbursements = pgTable('reimbursements', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  expensePlaidTransactionId: text('expense_plaid_transaction_id'),
  expenseManualTransactionId: uuid('expense_manual_transaction_id').references(() => manualTransactions.id),
  incomePlaidTransactionId: text('income_plaid_transaction_id'),
  incomeManualTransactionId: uuid('income_manual_transaction_id').references(() => manualTransactions.id),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  expenseXor: check(
    'expense_xor',
    sql`(${table.expensePlaidTransactionId} IS NOT NULL) <> (${table.expenseManualTransactionId} IS NOT NULL)`,
  ),
  incomeXor: check(
    'income_xor',
    sql`(${table.incomePlaidTransactionId} IS NOT NULL) <> (${table.incomeManualTransactionId} IS NOT NULL)`,
  ),
}))
```

```ts
// backend/drizzle.config.ts
import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/lib/db/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Generate the initial migration**

Run: `cd backend && npm run db:generate`
Expected: a new SQL file under `backend/drizzle/` with `CREATE TABLE` statements for all 10 tables, plus the two CHECK constraints on `reimbursements`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/db/schema.ts backend/src/lib/db/schema.test.ts backend/drizzle.config.ts backend/drizzle
git commit -m "feat: add Drizzle schema for all backend tables"
```

---

### Task 5: DB and Supabase data clients

**Files:**
- Create: `backend/src/lib/db/client.ts`
- Create: `backend/src/lib/supabase/serviceClient.ts`
- Create: `backend/src/lib/supabase/scopedClient.ts`
- Test: `backend/src/lib/supabase/scopedClient.test.ts`

**Interfaces:**
- Consumes: `schema` from Task 4; env vars `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Produces: `db` (Drizzle instance, service-role Postgres connection) — used only by `plaidCredentialRepository`/`plaidItemRepository` (Task 7). `getServiceClient(): SupabaseClient` — used by the same two repos. `getScopedClient(jwt: string): SupabaseClient` — used by every other repository (Tasks 9–13) so RLS applies.

- [ ] **Step 1: Write the failing test**

`client.ts` and `serviceClient.ts` are thin instantiation wrappers with no branching logic — they're exercised indirectly by repository tests (Tasks 7, 9–13) via mocking, not directly here. `scopedClient.ts` has one behavior worth a unit test: it must construct a fresh client per call, authenticated with the passed JWT.

```ts
import { describe, expect, it, vi } from 'vitest'

const createClientMock = vi.fn(() => ({ __mocked: true }))
vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }))

describe('getScopedClient', () => {
  it('creates a new Supabase client authenticated with the caller JWT', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon-key'
    const { getScopedClient } = await import('./scopedClient.js')

    getScopedClient('user-jwt-123')

    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer user-jwt-123' } },
      }),
    )
  })

  it('creates a distinct client on every call (no shared singleton)', async () => {
    const { getScopedClient } = await import('./scopedClient.js')
    const a = getScopedClient('jwt-a')
    const b = getScopedClient('jwt-b')
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/lib/supabase/scopedClient.test.ts`
Expected: FAIL — `scopedClient.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/lib/db/client.ts
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

const queryClient = postgres(connectionString)
export const db = drizzle(queryClient, { schema })
```

```ts
// backend/src/lib/supabase/serviceClient.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | undefined

export function getServiceClient(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
    }
    client = createClient(url, serviceKey, { auth: { persistSession: false } })
  }
  return client
}
```

```ts
// backend/src/lib/supabase/scopedClient.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function getScopedClient(jwt: string): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set')
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
}
```

Note: add `SUPABASE_SERVICE_ROLE_KEY` to `backend/.env.example` (used by `serviceClient.ts`, omitted from the original architecture.md env list by oversight — required for any service-role Supabase call).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/lib/supabase/scopedClient.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/db/client.ts backend/src/lib/supabase/serviceClient.ts backend/src/lib/supabase/scopedClient.ts backend/src/lib/supabase/scopedClient.test.ts backend/.env.example
git commit -m "feat: add DB and Supabase data clients"
```

---

### Task 6: Auth middleware + tRPC context/procedures

**Files:**
- Create: `backend/src/middleware/requireAuth.ts`
- Create: `backend/src/trpc/context.ts`
- Create: `backend/src/trpc/trpc.ts`
- Test: `backend/src/middleware/requireAuth.test.ts`

**Interfaces:**
- Consumes: `process.env.SUPABASE_JWT_SECRET`.
- Produces: `verifyJwt(token: string): { userId: string }` from `requireAuth.ts` — used by `context.ts`. `createContext` producing `{ userId: string | null, jwt: string | null }`. `router`, `publicProcedure`, `protectedProcedure` from `trpc.ts` — every router task (8, 10–20) builds on `protectedProcedure`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import { verifyJwt } from './requireAuth.js'

describe('verifyJwt', () => {
  const secret = 'test-supabase-jwt-secret'

  it('extracts the user id from a valid Supabase JWT', () => {
    process.env.SUPABASE_JWT_SECRET = secret
    const token = jwt.sign({ sub: 'user-abc-123', role: 'authenticated' }, secret)
    expect(verifyJwt(token)).toEqual({ userId: 'user-abc-123' })
  })

  it('throws on an invalid signature', () => {
    process.env.SUPABASE_JWT_SECRET = secret
    const token = jwt.sign({ sub: 'user-abc-123' }, 'wrong-secret')
    expect(() => verifyJwt(token)).toThrow()
  })

  it('throws on an expired token', () => {
    process.env.SUPABASE_JWT_SECRET = secret
    const token = jwt.sign({ sub: 'user-abc-123' }, secret, { expiresIn: -10 })
    expect(() => verifyJwt(token)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/middleware/requireAuth.test.ts`
Expected: FAIL — `requireAuth.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/middleware/requireAuth.ts
import jwt from 'jsonwebtoken'

export function verifyJwt(token: string): { userId: string } {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET is not set')
  }
  const payload = jwt.verify(token, secret) as jwt.JwtPayload
  if (!payload.sub) {
    throw new Error('JWT missing subject claim')
  }
  return { userId: payload.sub }
}
```

```ts
// backend/src/trpc/context.ts
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import { verifyJwt } from '../middleware/requireAuth.js'

export function createContext({ req }: CreateFastifyContextOptions) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return { userId: null, jwt: null }
  }

  try {
    const { userId } = verifyJwt(token)
    return { userId, jwt: token }
  } catch {
    return { userId: null, jwt: null }
  }
}

export type Context = ReturnType<typeof createContext>
```

```ts
// backend/src/trpc/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server'
import type { Context } from './context.js'

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId || !ctx.jwt) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({ ctx: { userId: ctx.userId, jwt: ctx.jwt } })
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/middleware/requireAuth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/requireAuth.ts backend/src/middleware/requireAuth.test.ts backend/src/trpc/context.ts backend/src/trpc/trpc.ts
git commit -m "feat: add JWT verification middleware and tRPC context/procedures"
```

---

### Task 7: Plaid client factory + PFC taxonomy

**Files:**
- Create: `backend/src/lib/plaid/client.ts`
- Create: `backend/src/lib/plaid/pfc.ts`
- Test: `backend/src/lib/plaid/pfc.test.ts`

**Interfaces:**
- Produces: `createPlaidClient(clientId: string, secret: string, environment: 'sandbox' | 'development' | 'production'): PlaidApi` — used by `plaidCredentialService` (Task 9) and `transactionRepository`/`plaidLinkService` (Tasks 10–11). `DEFAULT_PFC_MAPPING: Array<{ ledgeCategory: string, primary: string, color: string, icon: string, subcategories: string[], detailedCodes: string[] }>` and `ALL_PFC_DETAILED_CODES: string[]` from `pfc.ts` — used by `onboardingService` (Task 20), which reads `entry.primary` directly when writing each `plaid_category_mappings` row (no derivation from `detailedCodes`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { ALL_PFC_DETAILED_CODES, DEFAULT_PFC_MAPPING } from './pfc.js'

describe('pfc taxonomy', () => {
  it('assigns every detailed code to exactly one default Ledge category', () => {
    const seen = new Map<string, string>()
    for (const entry of DEFAULT_PFC_MAPPING) {
      for (const code of entry.detailedCodes) {
        expect(seen.has(code)).toBe(false)
        seen.set(code, entry.ledgeCategory)
      }
    }
    expect(seen.size).toBe(ALL_PFC_DETAILED_CODES.length)
  })

  it('covers every code declared in ALL_PFC_DETAILED_CODES', () => {
    const mapped = new Set(DEFAULT_PFC_MAPPING.flatMap((e) => e.detailedCodes))
    for (const code of ALL_PFC_DETAILED_CODES) {
      expect(mapped.has(code)).toBe(true)
    }
  })

  it('includes the Food & Drink category with its documented codes', () => {
    const foodAndDrink = DEFAULT_PFC_MAPPING.find((e) => e.ledgeCategory === 'Food & Drink')
    expect(foodAndDrink?.detailedCodes).toEqual(
      expect.arrayContaining([
        'FOOD_AND_DRINK_RESTAURANTS',
        'FOOD_AND_DRINK_FAST_FOOD',
        'FOOD_AND_DRINK_GROCERIES',
        'FOOD_AND_DRINK_COFFEE',
        'FOOD_AND_DRINK_ALCOHOL_AND_BARS',
        'FOOD_AND_DRINK_FOOD_DELIVERY_SERVICES',
      ]),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/lib/plaid/pfc.test.ts`
Expected: FAIL — `pfc.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/lib/plaid/client.ts
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

export function createPlaidClient(
  clientId: string,
  secret: string,
  environment: 'sandbox' | 'development' | 'production',
): PlaidApi {
  const configuration = new Configuration({
    basePath: PlaidEnvironments[environment],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })
  return new PlaidApi(configuration)
}
```

```ts
// backend/src/lib/plaid/pfc.ts
// Source: Plaid's Personal Finance Category (PFC) taxonomy, `personal_finance_category_version: 'v2'`.
// Verify against https://plaid.com/docs/api/products/transactions/#personal-finance-category-taxonomy
// whenever Plaid revises the taxonomy — this list is the single source of truth for onboarding
// category seeding (see onboardingService, Task 20).

export interface PfcMappingEntry {
  ledgeCategory: string
  /** Plaid's primary PFC code shared by every entry in detailedCodes, e.g. 'FOOD_AND_DRINK'. */
  primary: string
  color: string
  icon: string
  subcategories: string[]
  detailedCodes: string[]
}

export const DEFAULT_PFC_MAPPING: PfcMappingEntry[] = [
  {
    ledgeCategory: 'Food & Drink',
    primary: 'FOOD_AND_DRINK',
    color: '#F97316',
    icon: '🍽',
    subcategories: ['Restaurants', 'Groceries', 'Coffee', 'Bars'],
    detailedCodes: [
      'FOOD_AND_DRINK_RESTAURANTS',
      'FOOD_AND_DRINK_FAST_FOOD',
      'FOOD_AND_DRINK_GROCERIES',
      'FOOD_AND_DRINK_COFFEE',
      'FOOD_AND_DRINK_ALCOHOL_AND_BARS',
      'FOOD_AND_DRINK_FOOD_DELIVERY_SERVICES',
      'FOOD_AND_DRINK_VENDING_MACHINES',
      'FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK',
    ],
  },
  {
    ledgeCategory: 'Transport',
    primary: 'TRANSPORTATION',
    color: '#3B82F6',
    icon: '🚗',
    subcategories: ['Rideshare', 'Gas', 'Transit', 'Parking'],
    detailedCodes: [
      'TRANSPORTATION_TAXIS_AND_RIDE_SHARES',
      'TRANSPORTATION_GAS',
      'TRANSPORTATION_PUBLIC_TRANSIT',
      'TRANSPORTATION_PARKING',
      'TRANSPORTATION_TOLLS',
      'TRANSPORTATION_BIKES_AND_SCOOTERS',
      'TRANSPORTATION_OTHER_TRANSPORTATION',
    ],
  },
  {
    ledgeCategory: 'Travel',
    primary: 'TRAVEL',
    color: '#8B5CF6',
    icon: '✈️',
    subcategories: ['Flights', 'Hotels', 'Vacation'],
    detailedCodes: [
      'TRAVEL_FLIGHTS',
      'TRAVEL_LODGING',
      'TRAVEL_RENTAL_CARS',
      'TRAVEL_PARKING',
      'TRAVEL_OTHER_TRAVEL',
    ],
  },
  {
    ledgeCategory: 'Entertainment',
    primary: 'ENTERTAINMENT',
    color: '#EC4899',
    icon: '🎮',
    subcategories: ['Streaming', 'Events', 'Games'],
    detailedCodes: [
      'ENTERTAINMENT_MUSIC_AND_AUDIO',
      'ENTERTAINMENT_TV_AND_MOVIES',
      'ENTERTAINMENT_VIDEO_GAMES',
      'ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS',
      'ENTERTAINMENT_CASINOS_AND_GAMBLING',
      'ENTERTAINMENT_OTHER_ENTERTAINMENT',
    ],
  },
  {
    ledgeCategory: 'Shopping',
    primary: 'GENERAL_MERCHANDISE',
    color: '#EAB308',
    icon: '🛍',
    subcategories: ['Clothing', 'Electronics', 'Amazon'],
    detailedCodes: [
      'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',
      'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES',
      'GENERAL_MERCHANDISE_ELECTRONICS',
      'GENERAL_MERCHANDISE_DEPARTMENT_STORES',
      'GENERAL_MERCHANDISE_DISCOUNT_STORES',
      'GENERAL_MERCHANDISE_PET_SUPPLIES',
      'GENERAL_MERCHANDISE_SPORTING_GOODS',
      'GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS',
      'GENERAL_MERCHANDISE_CONVENIENCE_STORES',
      'GENERAL_MERCHANDISE_TOBACCO_AND_VAPE',
      'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES',
      'GENERAL_MERCHANDISE_OFFICE_SUPPLIES',
      'GENERAL_MERCHANDISE_SUPERSTORES',
      'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
    ],
  },
  {
    ledgeCategory: 'Bills & Utilities',
    primary: 'RENT_AND_UTILITIES',
    color: '#6B7280',
    icon: '🧾',
    subcategories: ['Rent', 'Electric', 'Internet', 'Phone'],
    detailedCodes: [
      'RENT_AND_UTILITIES_RENT',
      'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY',
      'RENT_AND_UTILITIES_INTERNET_AND_CABLE',
      'RENT_AND_UTILITIES_TELEPHONE',
      'RENT_AND_UTILITIES_WATER',
      'RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT',
      'RENT_AND_UTILITIES_OTHER_UTILITIES',
    ],
  },
  {
    ledgeCategory: 'Health',
    primary: 'MEDICAL',
    color: '#10B981',
    icon: '⚕️',
    subcategories: ['Doctor', 'Pharmacy', 'Dental'],
    detailedCodes: [
      'MEDICAL_PRIMARY_CARE',
      'MEDICAL_DENTAL_CARE',
      'MEDICAL_EYE_CARE',
      'MEDICAL_NURSING_CARE',
      'MEDICAL_PHARMACIES_AND_SUPPLEMENTS',
      'MEDICAL_VETERINARY_SERVICES',
      'MEDICAL_OTHER_MEDICAL',
    ],
  },
  {
    ledgeCategory: 'Personal Care',
    primary: 'PERSONAL_CARE',
    color: '#F43F5E',
    icon: '💇',
    subcategories: ['Hair', 'Gym'],
    detailedCodes: [
      'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS',
      'PERSONAL_CARE_HAIR_AND_BEAUTY',
      'PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING',
      'PERSONAL_CARE_OTHER_PERSONAL_CARE',
    ],
  },
  {
    ledgeCategory: 'Home',
    primary: 'HOME_IMPROVEMENT',
    color: '#84CC16',
    icon: '🏠',
    subcategories: ['Furniture', 'Repairs'],
    detailedCodes: [
      'HOME_IMPROVEMENT_FURNITURE',
      'HOME_IMPROVEMENT_HARDWARE',
      'HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE',
      'HOME_IMPROVEMENT_SECURITY',
      'HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT',
    ],
  },
  {
    ledgeCategory: 'Services',
    primary: 'GENERAL_SERVICES',
    color: '#06B6D4',
    icon: '🧰',
    subcategories: ['Subscriptions', 'Insurance'],
    detailedCodes: [
      'GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING',
      'GENERAL_SERVICES_AUTOMOTIVE',
      'GENERAL_SERVICES_CHILDCARE',
      'GENERAL_SERVICES_CONSULTING_AND_LEGAL',
      'GENERAL_SERVICES_EDUCATION',
      'GENERAL_SERVICES_INSURANCE',
      'GENERAL_SERVICES_POSTAGE_AND_SHIPPING',
      'GENERAL_SERVICES_STORAGE',
      'GENERAL_SERVICES_OTHER_GENERAL_SERVICES',
    ],
  },
  {
    ledgeCategory: 'Income',
    primary: 'INCOME',
    color: '#34D399',
    icon: '💰',
    subcategories: ['Paycheck', 'Interest'],
    detailedCodes: [
      'INCOME_WAGES',
      'INCOME_OTHER_INCOME',
      'INCOME_INTEREST_EARNED',
      'INCOME_DIVIDENDS',
      'INCOME_RETIREMENT_PENSION',
      'INCOME_TAX_REFUND',
      'INCOME_UNEMPLOYMENT',
    ],
  },
  {
    ledgeCategory: 'Transfers In',
    primary: 'TRANSFER_IN',
    color: '#2DD4BF',
    icon: '⬇️',
    subcategories: ['Zelle', 'Venmo'],
    detailedCodes: [
      'TRANSFER_IN_ACCOUNT_TRANSFER',
      'TRANSFER_IN_PEER_TO_PEER_PAYMENT',
      'TRANSFER_IN_CASH_ADVANCES_AND_LOANS',
      'TRANSFER_IN_DEPOSIT',
      'TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS',
      'TRANSFER_IN_SAVINGS',
      'TRANSFER_IN_OTHER_TRANSFER_IN',
    ],
  },
  {
    ledgeCategory: 'Transfers Out',
    primary: 'TRANSFER_OUT',
    color: '#9CA3AF',
    icon: '⬆️',
    subcategories: ['Zelle', 'Venmo'],
    detailedCodes: [
      'TRANSFER_OUT_ACCOUNT_TRANSFER',
      'TRANSFER_OUT_PEER_TO_PEER_PAYMENT',
      'TRANSFER_OUT_SAVINGS',
      'TRANSFER_OUT_WITHDRAWAL',
      'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS',
      'TRANSFER_OUT_OTHER_TRANSFER_OUT',
    ],
  },
  {
    ledgeCategory: 'Loans',
    primary: 'LOAN_PAYMENTS',
    color: '#F87171',
    icon: '🏦',
    subcategories: ['Student Loans', 'Credit Card'],
    detailedCodes: [
      'LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT',
      'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
      'LOAN_PAYMENTS_MORTGAGE_PAYMENT',
      'LOAN_PAYMENTS_CAR_PAYMENT',
      'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT',
      'LOAN_PAYMENTS_OTHER_PAYMENT',
    ],
  },
  {
    ledgeCategory: 'Fees',
    primary: 'BANK_FEES',
    color: '#6B7280',
    icon: '⚠️',
    subcategories: [],
    detailedCodes: [
      'BANK_FEES_ATM_FEES',
      'BANK_FEES_FOREIGN_TRANSACTION_FEES',
      'BANK_FEES_INSUFFICIENT_FUNDS',
      'BANK_FEES_INTEREST_CHARGE',
      'BANK_FEES_OVERDRAFT_FEES',
      'BANK_FEES_OTHER_BANK_FEES',
    ],
  },
  {
    ledgeCategory: 'Other',
    primary: 'GOVERNMENT_AND_NON_PROFIT',
    color: '#71717A',
    icon: '❔',
    subcategories: [],
    detailedCodes: [
      'GOVERNMENT_AND_NON_PROFIT_DONATIONS',
      'GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES',
      'GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT',
      'GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT',
    ],
  },
]

export const ALL_PFC_DETAILED_CODES: string[] = DEFAULT_PFC_MAPPING.flatMap((e) => e.detailedCodes)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/lib/plaid/pfc.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/plaid/client.ts backend/src/lib/plaid/pfc.ts backend/src/lib/plaid/pfc.test.ts
git commit -m "feat: add Plaid client factory and default PFC taxonomy mapping"
```

---

### Task 8: `plaidCredentialRepository` + `plaidItemRepository`

**Files:**
- Create: `backend/src/repositories/plaidCredentialRepository.ts`
- Create: `backend/src/repositories/plaidItemRepository.ts`
- Test: `backend/src/repositories/plaidCredentialRepository.test.ts`
- Test: `backend/src/repositories/plaidItemRepository.test.ts`

**Interfaces:**
- Consumes: `db` (Task 5), `encrypt`/`decrypt` (Task 3), `plaidCredentials`/`plaidItems` tables (Task 4).
- Produces: `plaidCredentialRepository.upsert({ userId, clientId, secret, environment }): Promise<void>`, `plaidCredentialRepository.getDecrypted(userId): Promise<{ clientId, secret, environment } | null>`, `plaidCredentialRepository.getMasked(userId): Promise<{ clientId, environment, hasSecret: boolean } | null>` — used by `plaidCredentialService` (Task 9). `plaidItemRepository.create({ userId, institutionId, institutionName, accessToken, itemId }): Promise<void>`, `plaidItemRepository.listDecryptedTokens(userId): Promise<Array<{ itemId, accessToken, institutionName }>>` — used by `plaidLinkService`/`transactionRepository` (Tasks 10–11).

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/repositories/plaidCredentialRepository.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMock = {
  insert: vi.fn(),
  select: vi.fn(),
}
vi.mock('../lib/db/client.js', () => ({ db: dbMock }))
vi.mock('../lib/crypto/aes.js', () => ({
  encrypt: vi.fn((s: string) => `enc(${s})`),
  decrypt: vi.fn((s: string) => s.replace(/^enc\(|\)$/g, '')),
}))

describe('plaidCredentialRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('encrypts the secret before upserting', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined)
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    dbMock.insert.mockReturnValue({ values })

    const { plaidCredentialRepository } = await import('./plaidCredentialRepository.js')
    await plaidCredentialRepository.upsert({
      userId: 'user-1',
      clientId: 'client-abc',
      secret: 'plaintext-secret',
      environment: 'sandbox',
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        clientId: 'client-abc',
        encryptedSecret: 'enc(plaintext-secret)',
        environment: 'sandbox',
      }),
    )
  })

  it('returns decrypted credentials for a user', async () => {
    const where = vi.fn().mockResolvedValue([
      { clientId: 'client-abc', encryptedSecret: 'enc(plaintext-secret)', environment: 'sandbox' },
    ])
    const from = vi.fn(() => ({ where }))
    dbMock.select.mockReturnValue({ from })

    const { plaidCredentialRepository } = await import('./plaidCredentialRepository.js')
    const result = await plaidCredentialRepository.getDecrypted('user-1')

    expect(result).toEqual({ clientId: 'client-abc', secret: 'plaintext-secret', environment: 'sandbox' })
  })

  it('returns null when no credentials exist', async () => {
    const where = vi.fn().mockResolvedValue([])
    dbMock.select.mockReturnValue({ from: vi.fn(() => ({ where })) })

    const { plaidCredentialRepository } = await import('./plaidCredentialRepository.js')
    expect(await plaidCredentialRepository.getDecrypted('user-1')).toBeNull()
  })
})
```

```ts
// backend/src/repositories/plaidItemRepository.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbMock = { insert: vi.fn(), select: vi.fn() }
vi.mock('../lib/db/client.js', () => ({ db: dbMock }))
vi.mock('../lib/crypto/aes.js', () => ({
  encrypt: vi.fn((s: string) => `enc(${s})`),
  decrypt: vi.fn((s: string) => s.replace(/^enc\(|\)$/g, '')),
}))

describe('plaidItemRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('encrypts the access token before inserting', async () => {
    const values = vi.fn().mockResolvedValue(undefined)
    dbMock.insert.mockReturnValue({ values })

    const { plaidItemRepository } = await import('./plaidItemRepository.js')
    await plaidItemRepository.create({
      userId: 'user-1',
      institutionId: 'ins_1',
      institutionName: 'Chase',
      accessToken: 'access-sandbox-xyz',
      itemId: 'item-1',
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedAccessToken: 'enc(access-sandbox-xyz)', itemId: 'item-1' }),
    )
  })

  it('lists decrypted access tokens for a user', async () => {
    const where = vi.fn().mockResolvedValue([
      { itemId: 'item-1', encryptedAccessToken: 'enc(access-1)', institutionName: 'Chase' },
    ])
    dbMock.select.mockReturnValue({ from: vi.fn(() => ({ where })) })

    const { plaidItemRepository } = await import('./plaidItemRepository.js')
    const result = await plaidItemRepository.listDecryptedTokens('user-1')

    expect(result).toEqual([{ itemId: 'item-1', accessToken: 'access-1', institutionName: 'Chase' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/repositories/plaidCredentialRepository.test.ts src/repositories/plaidItemRepository.test.ts`
Expected: FAIL — repository files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/repositories/plaidCredentialRepository.ts
import { eq } from 'drizzle-orm'
import { db } from '../lib/db/client.js'
import { plaidCredentials } from '../lib/db/schema.js'
import { decrypt, encrypt } from '../lib/crypto/aes.js'

type Environment = 'sandbox' | 'development' | 'production'

export const plaidCredentialRepository = {
  async upsert(input: { userId: string; clientId: string; secret: string; environment: Environment }): Promise<void> {
    await db
      .insert(plaidCredentials)
      .values({
        userId: input.userId,
        clientId: input.clientId,
        encryptedSecret: encrypt(input.secret),
        environment: input.environment,
      })
      .onConflictDoUpdate({
        target: plaidCredentials.userId,
        set: {
          clientId: input.clientId,
          encryptedSecret: encrypt(input.secret),
          environment: input.environment,
        },
      })
  },

  async getDecrypted(userId: string): Promise<{ clientId: string; secret: string; environment: Environment } | null> {
    const rows = await db.select().from(plaidCredentials).where(eq(plaidCredentials.userId, userId))
    const row = rows[0]
    if (!row) return null
    return {
      clientId: row.clientId,
      secret: decrypt(row.encryptedSecret),
      environment: row.environment as Environment,
    }
  },

  async getMasked(userId: string): Promise<{ clientId: string; environment: Environment; hasSecret: boolean } | null> {
    const rows = await db.select().from(plaidCredentials).where(eq(plaidCredentials.userId, userId))
    const row = rows[0]
    if (!row) return null
    return { clientId: row.clientId, environment: row.environment as Environment, hasSecret: true }
  },
}
```

```ts
// backend/src/repositories/plaidItemRepository.ts
import { eq } from 'drizzle-orm'
import { db } from '../lib/db/client.js'
import { plaidItems } from '../lib/db/schema.js'
import { decrypt, encrypt } from '../lib/crypto/aes.js'

export const plaidItemRepository = {
  async create(input: {
    userId: string
    institutionId: string
    institutionName: string
    accessToken: string
    itemId: string
  }): Promise<void> {
    await db.insert(plaidItems).values({
      userId: input.userId,
      institutionId: input.institutionId,
      institutionName: input.institutionName,
      encryptedAccessToken: encrypt(input.accessToken),
      itemId: input.itemId,
    })
  },

  async listDecryptedTokens(
    userId: string,
  ): Promise<Array<{ itemId: string; accessToken: string; institutionName: string }>> {
    const rows = await db.select().from(plaidItems).where(eq(plaidItems.userId, userId))
    return rows.map((row) => ({
      itemId: row.itemId,
      accessToken: decrypt(row.encryptedAccessToken),
      institutionName: row.institutionName,
    }))
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/repositories/plaidCredentialRepository.test.ts src/repositories/plaidItemRepository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/plaidCredentialRepository.ts backend/src/repositories/plaidItemRepository.ts backend/src/repositories/plaidCredentialRepository.test.ts backend/src/repositories/plaidItemRepository.test.ts
git commit -m "feat: add service-role Plaid credential and item repositories"
```

---

### Task 9: `plaidCredentialService` + `plaidCredentials` router

**Files:**
- Create: `backend/src/services/plaidCredentialService.ts`
- Create: `backend/src/routers/plaidCredentials.ts`
- Test: `backend/src/services/plaidCredentialService.test.ts`
- Test: `backend/src/routers/plaidCredentials.test.ts`

**Interfaces:**
- Consumes: `plaidCredentialRepository` (Task 8), `createPlaidClient` (Task 7), `protectedProcedure`/`router` (Task 6).
- Produces: `plaidCredentialService.save`, `.test`, `.get` — used by the router. tRPC router exposed as `plaidCredentials` with procedures `save`, `test`, `get` — used by `router.ts` (Task 21).

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/plaidCredentialService.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = {
  upsert: vi.fn(),
  getDecrypted: vi.fn(),
  getMasked: vi.fn(),
}
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: repoMock }))

const itemGet = vi.fn()
vi.mock('../lib/plaid/client.js', () => ({
  createPlaidClient: vi.fn(() => ({ itemGet })),
}))

describe('plaidCredentialService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('test() reports success when Plaid accepts the credentials', async () => {
    itemGet.mockResolvedValue({ data: {} })
    const { plaidCredentialService } = await import('./plaidCredentialService.js')

    const result = await plaidCredentialService.test({
      clientId: 'client-abc',
      secret: 'secret-abc',
      environment: 'sandbox',
    })

    expect(result).toEqual({ ok: true })
  })

  it('test() reports the specific Plaid error on failure', async () => {
    itemGet.mockRejectedValue({
      response: { data: { error_code: 'INVALID_API_KEYS', error_message: "Couldn't verify these keys" } },
    })
    const { plaidCredentialService } = await import('./plaidCredentialService.js')

    const result = await plaidCredentialService.test({
      clientId: 'client-abc',
      secret: 'wrong-secret',
      environment: 'sandbox',
    })

    expect(result).toEqual({ ok: false, errorCode: 'INVALID_API_KEYS', message: "Couldn't verify these keys" })
  })

  it('save() persists credentials only after a successful test', async () => {
    itemGet.mockResolvedValue({ data: {} })
    repoMock.upsert.mockResolvedValue(undefined)
    const { plaidCredentialService } = await import('./plaidCredentialService.js')

    const result = await plaidCredentialService.save('user-1', {
      clientId: 'client-abc',
      secret: 'secret-abc',
      environment: 'sandbox',
    })

    expect(repoMock.upsert).toHaveBeenCalledWith({
      userId: 'user-1',
      clientId: 'client-abc',
      secret: 'secret-abc',
      environment: 'sandbox',
    })
    expect(result).toEqual({ ok: true })
  })

  it('save() does not persist when the test call fails', async () => {
    itemGet.mockRejectedValue({ response: { data: { error_code: 'INVALID_API_KEYS', error_message: 'bad keys' } } })
    const { plaidCredentialService } = await import('./plaidCredentialService.js')

    const result = await plaidCredentialService.save('user-1', {
      clientId: 'client-abc',
      secret: 'wrong',
      environment: 'sandbox',
    })

    expect(repoMock.upsert).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
  })

  it('get() returns the masked view, never the plaintext secret', async () => {
    repoMock.getMasked.mockResolvedValue({ clientId: 'client-abc', environment: 'sandbox', hasSecret: true })
    const { plaidCredentialService } = await import('./plaidCredentialService.js')

    const result = await plaidCredentialService.get('user-1')

    expect(result).toEqual({ clientId: 'client-abc', environment: 'sandbox', hasSecret: true })
  })
})
```

```ts
// backend/src/routers/plaidCredentials.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMock = { save: vi.fn(), test: vi.fn(), get: vi.fn() }
vi.mock('../services/plaidCredentialService.js', () => ({ plaidCredentialService: serviceMock }))

describe('plaidCredentials router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('save calls the service with the authenticated user id and input', async () => {
    serviceMock.save.mockResolvedValue({ ok: true })
    const { plaidCredentialsRouter } = await import('./plaidCredentials.js')
    const caller = plaidCredentialsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    const result = await caller.save({ clientId: 'client-abc', secret: 'secret-abc', environment: 'sandbox' })

    expect(serviceMock.save).toHaveBeenCalledWith('user-1', {
      clientId: 'client-abc',
      secret: 'secret-abc',
      environment: 'sandbox',
    })
    expect(result).toEqual({ ok: true })
  })

  it('get calls the service with the authenticated user id', async () => {
    serviceMock.get.mockResolvedValue({ clientId: 'client-abc', environment: 'sandbox', hasSecret: true })
    const { plaidCredentialsRouter } = await import('./plaidCredentials.js')
    const caller = plaidCredentialsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    const result = await caller.get()

    expect(serviceMock.get).toHaveBeenCalledWith('user-1')
    expect(result).toEqual({ clientId: 'client-abc', environment: 'sandbox', hasSecret: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/plaidCredentialService.test.ts src/routers/plaidCredentials.test.ts`
Expected: FAIL — service/router files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/plaidCredentialService.ts
import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'

type Environment = 'sandbox' | 'development' | 'production'
type CredentialInput = { clientId: string; secret: string; environment: Environment }
type TestResult = { ok: true } | { ok: false; errorCode: string; message: string }

async function testCredentials(input: CredentialInput): Promise<TestResult> {
  const client = createPlaidClient(input.clientId, input.secret, input.environment)
  try {
    // A cheap authenticated call — fails fast on bad keys/environment mismatch without touching real data.
    await client.itemGet({ access_token: 'access-sandbox-test-connection-probe' } as never)
    return { ok: true }
  } catch (error) {
    const plaidError = (error as { response?: { data?: { error_code?: string; error_message?: string } } }).response
      ?.data
    if (plaidError?.error_code === 'INVALID_ACCESS_TOKEN') {
      // Credentials themselves were accepted; only the probe token was rejected, as expected.
      return { ok: true }
    }
    return {
      ok: false,
      errorCode: plaidError?.error_code ?? 'UNKNOWN_ERROR',
      message: plaidError?.error_message ?? 'Could not verify these keys.',
    }
  }
}

export const plaidCredentialService = {
  test: testCredentials,

  async save(userId: string, input: CredentialInput): Promise<TestResult> {
    const result = await testCredentials(input)
    if (!result.ok) return result
    await plaidCredentialRepository.upsert({ userId, ...input })
    return { ok: true }
  },

  async get(userId: string) {
    return plaidCredentialRepository.getMasked(userId)
  },
}
```

Note: `test()`'s cheap validation call depends on how the real Plaid sandbox distinguishes "bad client_id/secret" from "bad access_token" — during Task 9 execution, verify against Plaid's actual sandbox error codes (`INVALID_API_KEYS` vs `INVALID_ACCESS_TOKEN`) and adjust the branch if the observed behavior differs from this plan's assumption.

```ts
// backend/src/routers/plaidCredentials.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { plaidCredentialService } from '../services/plaidCredentialService.js'

const credentialInputSchema = z.object({
  clientId: z.string().min(1),
  secret: z.string().min(1),
  environment: z.enum(['sandbox', 'development', 'production']),
})

export const plaidCredentialsRouter = router({
  save: protectedProcedure.input(credentialInputSchema).mutation(({ ctx, input }) => {
    return plaidCredentialService.save(ctx.userId, input)
  }),

  test: protectedProcedure.input(credentialInputSchema).mutation(({ input }) => {
    return plaidCredentialService.test(input)
  }),

  get: protectedProcedure.query(({ ctx }) => {
    return plaidCredentialService.get(ctx.userId)
  }),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/plaidCredentialService.test.ts src/routers/plaidCredentials.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/plaidCredentialService.ts backend/src/routers/plaidCredentials.ts backend/src/services/plaidCredentialService.test.ts backend/src/routers/plaidCredentials.test.ts
git commit -m "feat: add plaidCredentials service and router (BYOK save/test/get)"
```

---

### Task 10: `plaidLinkService` + `plaidLink` router

**Files:**
- Create: `backend/src/services/plaidLinkService.ts`
- Create: `backend/src/routers/plaidLink.ts`
- Test: `backend/src/services/plaidLinkService.test.ts`
- Test: `backend/src/routers/plaidLink.test.ts`

**Interfaces:**
- Consumes: `plaidCredentialRepository.getDecrypted` (Task 8), `plaidItemRepository.create` (Task 8), `createPlaidClient` (Task 7).
- Produces: `plaidLinkService.createLinkToken(userId): Promise<{ linkToken: string }>`, `plaidLinkService.exchangeToken(userId, publicToken): Promise<{ institutionId, institutionName }>` — used by the router. tRPC router `plaidLink` with `createLinkToken`, `exchangeToken` — used by `router.ts` (Task 21).

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/plaidLinkService.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const credRepoMock = { getDecrypted: vi.fn() }
const itemRepoMock = { create: vi.fn() }
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: credRepoMock }))
vi.mock('../repositories/plaidItemRepository.js', () => ({ plaidItemRepository: itemRepoMock }))

const linkTokenCreate = vi.fn()
const itemPublicTokenExchange = vi.fn()
const itemGet = vi.fn()
const institutionsGetById = vi.fn()
vi.mock('../lib/plaid/client.js', () => ({
  createPlaidClient: vi.fn(() => ({
    linkTokenCreate,
    itemPublicTokenExchange,
    itemGet,
    institutionsGetById,
  })),
}))

describe('plaidLinkService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createLinkToken throws if the user has no saved Plaid credentials', async () => {
    credRepoMock.getDecrypted.mockResolvedValue(null)
    const { plaidLinkService } = await import('./plaidLinkService.js')

    await expect(plaidLinkService.createLinkToken('user-1')).rejects.toThrow(/Plaid credentials/i)
  })

  it('createLinkToken returns the link token using the user\'s own credentials', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    linkTokenCreate.mockResolvedValue({ data: { link_token: 'link-abc' } })
    const { plaidLinkService } = await import('./plaidLinkService.js')

    const result = await plaidLinkService.createLinkToken('user-1')

    expect(result).toEqual({ linkToken: 'link-abc' })
  })

  it('exchangeToken exchanges the public token and persists the encrypted access token', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemPublicTokenExchange.mockResolvedValue({ data: { access_token: 'access-1', item_id: 'item-1' } })
    itemGet.mockResolvedValue({ data: { item: { institution_id: 'ins_1' } } })
    institutionsGetById.mockResolvedValue({ data: { institution: { name: 'Chase' } } })
    itemRepoMock.create.mockResolvedValue(undefined)
    const { plaidLinkService } = await import('./plaidLinkService.js')

    const result = await plaidLinkService.exchangeToken('user-1', 'public-token-xyz')

    expect(itemRepoMock.create).toHaveBeenCalledWith({
      userId: 'user-1',
      institutionId: 'ins_1',
      institutionName: 'Chase',
      accessToken: 'access-1',
      itemId: 'item-1',
    })
    expect(result).toEqual({ institutionId: 'ins_1', institutionName: 'Chase' })
  })
})
```

```ts
// backend/src/routers/plaidLink.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMock = { createLinkToken: vi.fn(), exchangeToken: vi.fn() }
vi.mock('../services/plaidLinkService.js', () => ({ plaidLinkService: serviceMock }))

describe('plaidLink router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createLinkToken delegates to the service with the authenticated user id', async () => {
    serviceMock.createLinkToken.mockResolvedValue({ linkToken: 'link-abc' })
    const { plaidLinkRouter } = await import('./plaidLink.js')
    const caller = plaidLinkRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    expect(await caller.createLinkToken()).toEqual({ linkToken: 'link-abc' })
    expect(serviceMock.createLinkToken).toHaveBeenCalledWith('user-1')
  })

  it('exchangeToken passes the public token through', async () => {
    serviceMock.exchangeToken.mockResolvedValue({ institutionId: 'ins_1', institutionName: 'Chase' })
    const { plaidLinkRouter } = await import('./plaidLink.js')
    const caller = plaidLinkRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    const result = await caller.exchangeToken({ publicToken: 'public-token-xyz' })

    expect(serviceMock.exchangeToken).toHaveBeenCalledWith('user-1', 'public-token-xyz')
    expect(result).toEqual({ institutionId: 'ins_1', institutionName: 'Chase' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/plaidLinkService.test.ts src/routers/plaidLink.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/plaidLinkService.ts
import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'

async function requireCredentials(userId: string) {
  const creds = await plaidCredentialRepository.getDecrypted(userId)
  if (!creds) {
    throw new Error('No Plaid credentials saved for this user — connect a Plaid developer account first.')
  }
  return creds
}

export const plaidLinkService = {
  async createLinkToken(userId: string): Promise<{ linkToken: string }> {
    const creds = await requireCredentials(userId)
    const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)
    const response = await client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Ledge',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    } as never)
    return { linkToken: response.data.link_token }
  },

  async exchangeToken(userId: string, publicToken: string): Promise<{ institutionId: string; institutionName: string }> {
    const creds = await requireCredentials(userId)
    const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)

    const exchange = await client.itemPublicTokenExchange({ public_token: publicToken } as never)
    const accessToken = exchange.data.access_token
    const itemId = exchange.data.item_id

    const itemResponse = await client.itemGet({ access_token: accessToken } as never)
    const institutionId = itemResponse.data.item.institution_id as string

    const institutionResponse = await client.institutionsGetById({
      institution_id: institutionId,
      country_codes: ['US'],
    } as never)
    const institutionName = institutionResponse.data.institution.name as string

    await plaidItemRepository.create({ userId, institutionId, institutionName, accessToken, itemId })

    return { institutionId, institutionName }
  },
}
```

```ts
// backend/src/routers/plaidLink.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { plaidLinkService } from '../services/plaidLinkService.js'

export const plaidLinkRouter = router({
  createLinkToken: protectedProcedure.mutation(({ ctx }) => {
    return plaidLinkService.createLinkToken(ctx.userId)
  }),

  exchangeToken: protectedProcedure
    .input(z.object({ publicToken: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return plaidLinkService.exchangeToken(ctx.userId, input.publicToken)
    }),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/plaidLinkService.test.ts src/routers/plaidLink.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/plaidLinkService.ts backend/src/routers/plaidLink.ts backend/src/services/plaidLinkService.test.ts backend/src/routers/plaidLink.test.ts
git commit -m "feat: add plaidLink service and router (createLinkToken/exchangeToken)"
```

---

### Task 11: `transactionRepository` + `transactionSyncService` + `transactions` router

**Files:**
- Create: `backend/src/repositories/transactionRepository.ts`
- Create: `backend/src/services/transactionSyncService.ts`
- Create: `backend/src/routers/transactions.ts`
- Test: `backend/src/services/transactionSyncService.test.ts`
- Test: `backend/src/routers/transactions.test.ts`

**Interfaces:**
- Consumes: `plaidCredentialRepository.getDecrypted`, `plaidItemRepository.listDecryptedTokens` (Task 8), `createPlaidClient` (Task 7).
- Produces: `transactionRepository.sync(client, accessToken, cursor)` wrapping `client.transactionsSync`. `transactionSyncService.sync(userId, cursor): Promise<{ added, modified, removed, nextCursor, hasMore }>` — a **stateless relay**, no DB writes of transaction bodies (per Constraint 1). tRPC router `transactions` with `sync` — used by `router.ts` (Task 21).

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/transactionSyncService.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const credRepoMock = { getDecrypted: vi.fn() }
const itemRepoMock = { listDecryptedTokens: vi.fn() }
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: credRepoMock }))
vi.mock('../repositories/plaidItemRepository.js', () => ({ plaidItemRepository: itemRepoMock }))

const transactionsSync = vi.fn()
vi.mock('../lib/plaid/client.js', () => ({
  createPlaidClient: vi.fn(() => ({ transactionsSync })),
}))

describe('transactionSyncService', () => {
  beforeEach(() => vi.clearAllMocks())

  it('relays added/modified/removed transactions from every linked item without persisting them', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-1', accessToken: 'access-1', institutionName: 'Chase' },
    ])
    transactionsSync.mockResolvedValue({
      data: {
        added: [{ transaction_id: 't1', amount: 12.5 }],
        modified: [],
        removed: [],
        next_cursor: 'cursor-2',
        has_more: false,
      },
    })

    const { transactionSyncService } = await import('./transactionSyncService.js')
    const result = await transactionSyncService.sync('user-1', { 'item-1': 'cursor-1' })

    expect(transactionsSync).toHaveBeenCalledWith({ access_token: 'access-1', cursor: 'cursor-1' })
    expect(result).toEqual({
      added: [{ transaction_id: 't1', amount: 12.5 }],
      modified: [],
      removed: [],
      cursors: { 'item-1': 'cursor-2' },
      hasMore: false,
    })
  })

  it('defaults to an empty cursor for items not yet synced', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-new', accessToken: 'access-new', institutionName: 'Amex' },
    ])
    transactionsSync.mockResolvedValue({
      data: { added: [], modified: [], removed: [], next_cursor: 'cursor-1', has_more: false },
    })

    const { transactionSyncService } = await import('./transactionSyncService.js')
    await transactionSyncService.sync('user-1', {})

    expect(transactionsSync).toHaveBeenCalledWith({ access_token: 'access-new', cursor: '' })
  })
})
```

```ts
// backend/src/routers/transactions.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const serviceMock = { sync: vi.fn() }
vi.mock('../services/transactionSyncService.js', () => ({ transactionSyncService: serviceMock }))

describe('transactions router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sync passes the authenticated user id and cursor map through', async () => {
    serviceMock.sync.mockResolvedValue({ added: [], modified: [], removed: [], cursors: {}, hasMore: false })
    const { transactionsRouter } = await import('./transactions.js')
    const caller = transactionsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    await caller.sync({ cursors: { 'item-1': 'cursor-1' } })

    expect(serviceMock.sync).toHaveBeenCalledWith('user-1', { 'item-1': 'cursor-1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/transactionSyncService.test.ts src/routers/transactions.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/repositories/transactionRepository.ts
import type { PlaidApi } from 'plaid'

export const transactionRepository = {
  async sync(client: PlaidApi, accessToken: string, cursor: string) {
    const response = await client.transactionsSync({ access_token: accessToken, cursor } as never)
    return response.data
  },
}
```

```ts
// backend/src/services/transactionSyncService.ts
import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'
import { transactionRepository } from '../repositories/transactionRepository.js'

export const transactionSyncService = {
  async sync(userId: string, cursors: Record<string, string>) {
    const creds = await plaidCredentialRepository.getDecrypted(userId)
    if (!creds) throw new Error('No Plaid credentials saved for this user.')
    const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)
    const items = await plaidItemRepository.listDecryptedTokens(userId)

    const added: unknown[] = []
    const modified: unknown[] = []
    const removed: unknown[] = []
    const nextCursors: Record<string, string> = {}
    let hasMore = false

    for (const item of items) {
      const cursor = cursors[item.itemId] ?? ''
      const page = await transactionRepository.sync(client, item.accessToken, cursor)
      added.push(...page.added)
      modified.push(...page.modified)
      removed.push(...page.removed)
      nextCursors[item.itemId] = page.next_cursor
      hasMore = hasMore || page.has_more
    }

    // Relay only — nothing here is written to a table (see Constraint 1 in the plan header).
    return { added, modified, removed, cursors: nextCursors, hasMore }
  },
}
```

```ts
// backend/src/routers/transactions.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { transactionSyncService } from '../services/transactionSyncService.js'

export const transactionsRouter = router({
  sync: protectedProcedure
    .input(z.object({ cursors: z.record(z.string()) }))
    .query(({ ctx, input }) => {
      return transactionSyncService.sync(ctx.userId, input.cursors)
    }),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/transactionSyncService.test.ts src/routers/transactions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/transactionRepository.ts backend/src/services/transactionSyncService.ts backend/src/routers/transactions.ts backend/src/services/transactionSyncService.test.ts backend/src/routers/transactions.test.ts
git commit -m "feat: add cursor-based transactions.sync relay (no server-side persistence)"
```

---

### Task 12: `accountRepository` + `accounts` router

**Files:**
- Create: `backend/src/repositories/accountRepository.ts`
- Create: `backend/src/routers/accounts.ts`
- Test: `backend/src/routers/accounts.test.ts`

**Interfaces:**
- Consumes: `plaidCredentialRepository.getDecrypted`, `plaidItemRepository.listDecryptedTokens` (Task 8), `createPlaidClient` (Task 7).
- Produces: tRPC router `accounts` with `list` — a live relay of balances across every linked item, never persisted (per Constraint 1). No separate service layer — this fits entirely in one repository call per item, so the router calls the repository directly for this one case, same as `transactions.sync` does through its thin service. Used by `router.ts` (Task 21).

- [ ] **Step 1: Write the failing test**

Router-level test covers this feature end-to-end against a mocked Plaid client, since there's no service layer in between to isolate separately.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const credRepoMock = { getDecrypted: vi.fn() }
const itemRepoMock = { listDecryptedTokens: vi.fn() }
vi.mock('../repositories/plaidCredentialRepository.js', () => ({ plaidCredentialRepository: credRepoMock }))
vi.mock('../repositories/plaidItemRepository.js', () => ({ plaidItemRepository: itemRepoMock }))

const accountsGet = vi.fn()
vi.mock('../lib/plaid/client.js', () => ({ createPlaidClient: vi.fn(() => ({ accountsGet })) }))

describe('accounts router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('list relays live balances across every linked item, tagged with institution name', async () => {
    credRepoMock.getDecrypted.mockResolvedValue({ clientId: 'c', secret: 's', environment: 'sandbox' })
    itemRepoMock.listDecryptedTokens.mockResolvedValue([
      { itemId: 'item-1', accessToken: 'access-1', institutionName: 'Chase' },
    ])
    accountsGet.mockResolvedValue({
      data: { accounts: [{ account_id: 'acc-1', name: 'Sapphire', balances: { current: 4821 } }] },
    })

    const { accountsRouter } = await import('./accounts.js')
    const caller = accountsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    const result = await caller.list()

    expect(accountsGet).toHaveBeenCalledWith({ access_token: 'access-1' })
    expect(result).toEqual([
      { account_id: 'acc-1', name: 'Sapphire', balances: { current: 4821 }, institutionName: 'Chase' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routers/accounts.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/repositories/accountRepository.ts
import type { PlaidApi } from 'plaid'

export const accountRepository = {
  async get(client: PlaidApi, accessToken: string) {
    const response = await client.accountsGet({ access_token: accessToken })
    return response.data.accounts
  },
}
```

```ts
// backend/src/routers/accounts.ts
import { protectedProcedure, router } from '../trpc/trpc.js'
import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'
import { accountRepository } from '../repositories/accountRepository.js'

export const accountsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const creds = await plaidCredentialRepository.getDecrypted(ctx.userId)
    if (!creds) throw new Error('No Plaid credentials saved for this user.')
    const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)
    const items = await plaidItemRepository.listDecryptedTokens(ctx.userId)

    const results = []
    for (const item of items) {
      const accounts = await accountRepository.get(client, item.accessToken)
      for (const account of accounts) {
        results.push({ ...account, institutionName: item.institutionName })
      }
    }
    return results
  }),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routers/accounts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/accountRepository.ts backend/src/routers/accounts.ts backend/src/routers/accounts.test.ts
git commit -m "feat: add accounts.list live-balance relay"
```

---

### Task 13: `categoryRepository` + `subcategoryRepository` + routers

**Files:**
- Create: `backend/src/repositories/categoryRepository.ts`
- Create: `backend/src/repositories/subcategoryRepository.ts`
- Create: `backend/src/routers/categories.ts`
- Create: `backend/src/routers/subcategories.ts`
- Test: `backend/src/repositories/categoryRepository.test.ts`
- Test: `backend/src/routers/categories.test.ts`

**Interfaces:**
- Consumes: `getScopedClient` (Task 5).
- Produces: `categoryRepository.list/create/update/delete(jwt, userId, ...)`, `subcategoryRepository.list/create/update/delete(jwt, userId, ...)`. Both return `{ id, name, color, icon }` / `{ id, categoryId, name }` shapes. tRPC routers `categories`, `subcategories` — used by `router.ts` (Task 21) and by `vendorMappingRepository`/`plaidCategoryMappingRepository` (Task 14) as the `categoryId` foreign key target.

This is the reference pattern for every remaining "ordinary CRUD" domain (Tasks 14–17 follow it exactly, adjusted for their own columns) — implemented once in full here.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/repositories/categoryRepository.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const singleMock = vi.fn()
const supabaseClientMock = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: singleMock,
    order: vi.fn().mockResolvedValue({ data: [{ id: 'cat-1', name: 'Food & Drink', color: '#F97316', icon: '🍽' }], error: null }),
  })),
}
vi.mock('../lib/supabase/scopedClient.js', () => ({ getScopedClient: vi.fn(() => supabaseClientMock) }))

describe('categoryRepository', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists categories for the caller via a scoped client', async () => {
    const { categoryRepository } = await import('./categoryRepository.js')
    const result = await categoryRepository.list('jwt-1')

    expect(result).toEqual([{ id: 'cat-1', name: 'Food & Drink', color: '#F97316', icon: '🍽' }])
  })

  it('creates a category scoped to the caller\'s user id', async () => {
    singleMock.mockResolvedValue({ data: { id: 'cat-2', name: 'Shopping', color: '#EAB308', icon: '🛍' }, error: null })
    const { categoryRepository } = await import('./categoryRepository.js')

    const result = await categoryRepository.create('jwt-1', 'user-1', { name: 'Shopping', color: '#EAB308', icon: '🛍' })

    expect(result).toEqual({ id: 'cat-2', name: 'Shopping', color: '#EAB308', icon: '🛍' })
  })
})
```

```ts
// backend/src/routers/categories.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/categoryRepository.js', () => ({ categoryRepository: repoMock }))

describe('categories router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('list scopes the query via the caller\'s JWT', async () => {
    repoMock.list.mockResolvedValue([])
    const { categoriesRouter } = await import('./categories.js')
    const caller = categoriesRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    await caller.list()

    expect(repoMock.list).toHaveBeenCalledWith('jwt-1')
  })

  it('create passes the caller\'s user id and JWT to the repository', async () => {
    repoMock.create.mockResolvedValue({ id: 'cat-1', name: 'Shopping', color: '#EAB308', icon: '🛍' })
    const { categoriesRouter } = await import('./categories.js')
    const caller = categoriesRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    await caller.create({ name: 'Shopping', color: '#EAB308', icon: '🛍' })

    expect(repoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', { name: 'Shopping', color: '#EAB308', icon: '🛍' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/repositories/categoryRepository.test.ts src/routers/categories.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/repositories/categoryRepository.ts
import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface Category {
  id: string
  name: string
  color: string
  icon: string
}

export const categoryRepository = {
  async list(jwt: string): Promise<Category[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('categories').select('id, name, color, icon').order('name')
    if (error) throw error
    return data
  },

  async create(jwt: string, userId: string, input: { name: string; color: string; icon: string }): Promise<Category> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('categories')
      .insert({ user_id: userId, ...input })
      .select('id, name, color, icon')
      .single()
    if (error) throw error
    return data
  },

  async update(jwt: string, id: string, input: Partial<{ name: string; color: string; icon: string }>): Promise<Category> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('categories').update(input).eq('id', id).select('id, name, color, icon').single()
    if (error) throw error
    return data
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('categories').delete().eq('id', id)
    if (error) throw error
  },
}
```

```ts
// backend/src/repositories/subcategoryRepository.ts
import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface Subcategory {
  id: string
  categoryId: string
  name: string
}

export const subcategoryRepository = {
  async list(jwt: string, categoryId?: string): Promise<Subcategory[]> {
    const client = getScopedClient(jwt)
    let query = client.from('subcategories').select('id, category_id, name').order('name')
    if (categoryId) query = query.eq('category_id', categoryId)
    const { data, error } = await query
    if (error) throw error
    return data.map((row: { id: string; category_id: string; name: string }) => ({
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
    }))
  },

  async create(jwt: string, userId: string, input: { categoryId: string; name: string }): Promise<Subcategory> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('subcategories')
      .insert({ user_id: userId, category_id: input.categoryId, name: input.name })
      .select('id, category_id, name')
      .single()
    if (error) throw error
    return { id: data.id, categoryId: data.category_id, name: data.name }
  },

  async update(jwt: string, id: string, input: Partial<{ name: string }>): Promise<Subcategory> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('subcategories').update(input).eq('id', id).select('id, category_id, name').single()
    if (error) throw error
    return { id: data.id, categoryId: data.category_id, name: data.name }
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('subcategories').delete().eq('id', id)
    if (error) throw error
  },
}
```

```ts
// backend/src/routers/categories.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { categoryRepository } from '../repositories/categoryRepository.js'

export const categoriesRouter = router({
  list: protectedProcedure.query(({ ctx }) => categoryRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), color: z.string().min(1), icon: z.string().min(1) }))
    .mutation(({ ctx, input }) => categoryRepository.create(ctx.jwt, ctx.userId, input)),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1).optional(), color: z.string().min(1).optional(), icon: z.string().min(1).optional() }))
    .mutation(({ ctx, input }) => categoryRepository.update(ctx.jwt, input.id, input)),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => categoryRepository.delete(ctx.jwt, input.id)),
})
```

```ts
// backend/src/routers/subcategories.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { subcategoryRepository } from '../repositories/subcategoryRepository.js'

export const subcategoriesRouter = router({
  list: protectedProcedure
    .input(z.object({ categoryId: z.string().uuid().optional() }))
    .query(({ ctx, input }) => subcategoryRepository.list(ctx.jwt, input.categoryId)),

  create: protectedProcedure
    .input(z.object({ categoryId: z.string().uuid(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) => subcategoryRepository.create(ctx.jwt, ctx.userId, input)),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) => subcategoryRepository.update(ctx.jwt, input.id, { name: input.name })),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => subcategoryRepository.delete(ctx.jwt, input.id)),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/repositories/categoryRepository.test.ts src/routers/categories.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/categoryRepository.ts backend/src/repositories/subcategoryRepository.ts backend/src/routers/categories.ts backend/src/routers/subcategories.ts backend/src/repositories/categoryRepository.test.ts backend/src/routers/categories.test.ts
git commit -m "feat: add categories and subcategories CRUD (RLS-scoped)"
```

---

### Task 14: `plaidCategoryMappingRepository` + router

**Files:**
- Create: `backend/src/repositories/plaidCategoryMappingRepository.ts`
- Create: `backend/src/routers/plaidCategoryMappings.ts`
- Test: `backend/src/routers/plaidCategoryMappings.test.ts`

**Interfaces:**
- Consumes: `getScopedClient` (Task 5); follows the exact pattern from Task 13.
- Produces: `plaidCategoryMappingRepository.list/create/update/delete(jwt, userId, ...)` over `plaid_category_mappings` (columns `plaid_pfc_primary`, `plaid_pfc_detailed`, `category_id`). tRPC router `plaidCategoryMappings` — used by `router.ts` (Task 21) and read by `onboardingService`/`categorizationService` (Tasks 15, 20) for PFC → category resolution.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/plaidCategoryMappingRepository.js', () => ({ plaidCategoryMappingRepository: repoMock }))

describe('plaidCategoryMappings router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('create rejects assigning a PFC code that is already claimed by another category (unique constraint bubbles up as an error)', async () => {
    repoMock.create.mockRejectedValue(new Error('duplicate key value violates unique constraint'))
    const { plaidCategoryMappingsRouter } = await import('./plaidCategoryMappings.js')
    const caller = plaidCategoryMappingsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    await expect(
      caller.create({ plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: 'cat-1' }),
    ).rejects.toThrow()
  })

  it('list returns mappings scoped to the caller', async () => {
    repoMock.list.mockResolvedValue([
      { id: 'map-1', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: 'cat-1' },
    ])
    const { plaidCategoryMappingsRouter } = await import('./plaidCategoryMappings.js')
    const caller = plaidCategoryMappingsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    expect(await caller.list()).toHaveLength(1)
    expect(repoMock.list).toHaveBeenCalledWith('jwt-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routers/plaidCategoryMappings.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/repositories/plaidCategoryMappingRepository.ts
import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface PlaidCategoryMapping {
  id: string
  plaidPfcPrimary: string
  plaidPfcDetailed: string | null
  categoryId: string
}

function fromRow(row: { id: string; plaid_pfc_primary: string; plaid_pfc_detailed: string | null; category_id: string }): PlaidCategoryMapping {
  return { id: row.id, plaidPfcPrimary: row.plaid_pfc_primary, plaidPfcDetailed: row.plaid_pfc_detailed, categoryId: row.category_id }
}

export const plaidCategoryMappingRepository = {
  async list(jwt: string): Promise<PlaidCategoryMapping[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('plaid_category_mappings').select('id, plaid_pfc_primary, plaid_pfc_detailed, category_id')
    if (error) throw error
    return data.map(fromRow)
  },

  async create(
    jwt: string,
    userId: string,
    input: { plaidPfcPrimary: string; plaidPfcDetailed: string | null; categoryId: string },
  ): Promise<PlaidCategoryMapping> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('plaid_category_mappings')
      .insert({
        user_id: userId,
        plaid_pfc_primary: input.plaidPfcPrimary,
        plaid_pfc_detailed: input.plaidPfcDetailed,
        category_id: input.categoryId,
      })
      .select('id, plaid_pfc_primary, plaid_pfc_detailed, category_id')
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async update(jwt: string, id: string, categoryId: string): Promise<PlaidCategoryMapping> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('plaid_category_mappings')
      .update({ category_id: categoryId })
      .eq('id', id)
      .select('id, plaid_pfc_primary, plaid_pfc_detailed, category_id')
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('plaid_category_mappings').delete().eq('id', id)
    if (error) throw error
  },
}
```

```ts
// backend/src/routers/plaidCategoryMappings.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { plaidCategoryMappingRepository } from '../repositories/plaidCategoryMappingRepository.js'

export const plaidCategoryMappingsRouter = router({
  list: protectedProcedure.query(({ ctx }) => plaidCategoryMappingRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(z.object({ plaidPfcPrimary: z.string().min(1), plaidPfcDetailed: z.string().nullable(), categoryId: z.string().uuid() }))
    .mutation(({ ctx, input }) => plaidCategoryMappingRepository.create(ctx.jwt, ctx.userId, input)),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), categoryId: z.string().uuid() }))
    .mutation(({ ctx, input }) => plaidCategoryMappingRepository.update(ctx.jwt, input.id, input.categoryId)),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => plaidCategoryMappingRepository.delete(ctx.jwt, input.id)),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routers/plaidCategoryMappings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/plaidCategoryMappingRepository.ts backend/src/routers/plaidCategoryMappings.ts backend/src/routers/plaidCategoryMappings.test.ts
git commit -m "feat: add plaidCategoryMappings CRUD"
```

---

### Task 15: `vendorMappingRepository` + `categorizationService` + `vendorMappings` router

**Files:**
- Create: `backend/src/repositories/vendorMappingRepository.ts`
- Create: `backend/src/services/categorizationService.ts`
- Create: `backend/src/routers/vendorMappings.ts`
- Test: `backend/src/services/categorizationService.test.ts`
- Test: `backend/src/routers/vendorMappings.test.ts`

**Interfaces:**
- Consumes: `getScopedClient` (Task 5), `plaidCategoryMappingRepository.list` (Task 14).
- Produces: `vendorMappingRepository.list/upsert/bulkRecategorize(jwt, userId, ...)`. `categorizationService.resolveCategory(mappings, pfc): { categoryId, subcategoryId } | null` — pure PFC → category resolution logic (detailed overrides primary), used by `onboardingService` (Task 20) to generate `plaid_auto` vendor mappings. tRPC router `vendorMappings` with `list`, `upsert`, `bulkRecategorize` — used by `router.ts` (Task 21).

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/categorizationService.test.ts
import { describe, expect, it } from 'vitest'
import { categorizationService } from './categorizationService.js'

describe('categorizationService.resolveCategory', () => {
  const mappings = [
    { id: 'm1', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: null, categoryId: 'cat-food' },
    { id: 'm2', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: 'cat-coffee' },
  ]

  it('prefers the detailed-code mapping over the primary-only mapping', () => {
    const result = categorizationService.resolveCategory(mappings, {
      primary: 'FOOD_AND_DRINK',
      detailed: 'FOOD_AND_DRINK_COFFEE',
    })
    expect(result).toEqual({ categoryId: 'cat-coffee' })
  })

  it('falls back to the primary-only mapping when no detailed mapping exists', () => {
    const result = categorizationService.resolveCategory(mappings, {
      primary: 'FOOD_AND_DRINK',
      detailed: 'FOOD_AND_DRINK_RESTAURANTS',
    })
    expect(result).toEqual({ categoryId: 'cat-food' })
  })

  it('returns null when no mapping matches at all', () => {
    const result = categorizationService.resolveCategory(mappings, { primary: 'TRAVEL', detailed: 'TRAVEL_FLIGHTS' })
    expect(result).toBeNull()
  })
})
```

```ts
// backend/src/routers/vendorMappings.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), upsert: vi.fn(), bulkRecategorize: vi.fn() }
vi.mock('../repositories/vendorMappingRepository.js', () => ({ vendorMappingRepository: repoMock }))

describe('vendorMappings router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upsert always writes source=user_defined, overriding any plaid_auto mapping', async () => {
    repoMock.upsert.mockResolvedValue({ id: 'vm-1', vendorName: 'panda express', categoryId: 'cat-1', subcategoryId: null, source: 'user_defined' })
    const { vendorMappingsRouter } = await import('./vendorMappings.js')
    const caller = vendorMappingsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    await caller.upsert({ vendorName: 'panda express', categoryId: 'cat-1', subcategoryId: null })

    expect(repoMock.upsert).toHaveBeenCalledWith('jwt-1', 'user-1', {
      vendorName: 'panda express',
      categoryId: 'cat-1',
      subcategoryId: null,
      source: 'user_defined',
    })
  })

  it('bulkRecategorize applies the mapping to every past transaction for that vendor', async () => {
    repoMock.bulkRecategorize.mockResolvedValue({ updatedCount: 3 })
    const { vendorMappingsRouter } = await import('./vendorMappings.js')
    const caller = vendorMappingsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    const result = await caller.bulkRecategorize({
      vendorName: 'panda express',
      plaidTransactionIds: ['t1', 't2', 't3'],
      categoryId: 'cat-1',
      subcategoryId: null,
    })

    expect(repoMock.bulkRecategorize).toHaveBeenCalledWith('jwt-1', 'user-1', {
      vendorName: 'panda express',
      plaidTransactionIds: ['t1', 't2', 't3'],
      categoryId: 'cat-1',
      subcategoryId: null,
    })
    expect(result).toEqual({ updatedCount: 3 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/categorizationService.test.ts src/routers/vendorMappings.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/categorizationService.ts
import type { PlaidCategoryMapping } from '../repositories/plaidCategoryMappingRepository.js'

export const categorizationService = {
  resolveCategory(
    mappings: PlaidCategoryMapping[],
    pfc: { primary: string; detailed: string },
  ): { categoryId: string } | null {
    const detailedMatch = mappings.find((m) => m.plaidPfcDetailed === pfc.detailed)
    if (detailedMatch) return { categoryId: detailedMatch.categoryId }

    const primaryMatch = mappings.find((m) => m.plaidPfcPrimary === pfc.primary && m.plaidPfcDetailed === null)
    if (primaryMatch) return { categoryId: primaryMatch.categoryId }

    return null
  },
}
```

```ts
// backend/src/repositories/vendorMappingRepository.ts
import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface VendorMapping {
  id: string
  vendorName: string
  categoryId: string
  subcategoryId: string | null
  source: 'plaid_auto' | 'user_defined'
}

function fromRow(row: {
  id: string
  vendor_name: string
  category_id: string
  subcategory_id: string | null
  source: string
}): VendorMapping {
  return {
    id: row.id,
    vendorName: row.vendor_name,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    source: row.source as 'plaid_auto' | 'user_defined',
  }
}

export const vendorMappingRepository = {
  async list(jwt: string): Promise<VendorMapping[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('vendor_mappings').select('id, vendor_name, category_id, subcategory_id, source')
    if (error) throw error
    return data.map(fromRow)
  },

  async upsert(
    jwt: string,
    userId: string,
    input: { vendorName: string; categoryId: string; subcategoryId: string | null; source: 'plaid_auto' | 'user_defined' },
  ): Promise<VendorMapping> {
    const client = getScopedClient(jwt)
    const existing = await client
      .from('vendor_mappings')
      .select('id')
      .eq('user_id', userId)
      .eq('vendor_name', input.vendorName)
      .maybeSingle()

    const values = {
      user_id: userId,
      vendor_name: input.vendorName,
      category_id: input.categoryId,
      subcategory_id: input.subcategoryId,
      source: input.source,
    }

    const query = existing.data
      ? client.from('vendor_mappings').update(values).eq('id', existing.data.id)
      : client.from('vendor_mappings').insert(values)

    const { data, error } = await query.select('id, vendor_name, category_id, subcategory_id, source').single()
    if (error) throw error
    return fromRow(data)
  },

  // Bulk-write transaction_overrides for every given plaidTransactionId of this vendor (local cache IDs
  // supplied by the client, since Plaid transactions aren't persisted server-side — see architecture.md).
  async bulkRecategorize(
    jwt: string,
    userId: string,
    input: { vendorName: string; plaidTransactionIds: string[]; categoryId: string; subcategoryId: string | null },
  ): Promise<{ updatedCount: number }> {
    const client = getScopedClient(jwt)
    const rows = input.plaidTransactionIds.map((plaidTransactionId) => ({
      user_id: userId,
      plaid_transaction_id: plaidTransactionId,
      category_id: input.categoryId,
      subcategory_id: input.subcategoryId,
    }))
    const { error } = await client.from('transaction_overrides').upsert(rows, { onConflict: 'user_id,plaid_transaction_id' })
    if (error) throw error
    return { updatedCount: rows.length }
  },
}
```

```ts
// backend/src/routers/vendorMappings.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { vendorMappingRepository } from '../repositories/vendorMappingRepository.js'

export const vendorMappingsRouter = router({
  list: protectedProcedure.query(({ ctx }) => vendorMappingRepository.list(ctx.jwt)),

  upsert: protectedProcedure
    .input(z.object({ vendorName: z.string().min(1), categoryId: z.string().uuid(), subcategoryId: z.string().uuid().nullable() }))
    .mutation(({ ctx, input }) =>
      vendorMappingRepository.upsert(ctx.jwt, ctx.userId, { ...input, source: 'user_defined' }),
    ),

  bulkRecategorize: protectedProcedure
    .input(
      z.object({
        vendorName: z.string().min(1),
        plaidTransactionIds: z.array(z.string().min(1)),
        categoryId: z.string().uuid(),
        subcategoryId: z.string().uuid().nullable(),
      }),
    )
    .mutation(({ ctx, input }) => vendorMappingRepository.bulkRecategorize(ctx.jwt, ctx.userId, input)),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/categorizationService.test.ts src/routers/vendorMappings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/vendorMappingRepository.ts backend/src/services/categorizationService.ts backend/src/routers/vendorMappings.ts backend/src/services/categorizationService.test.ts backend/src/routers/vendorMappings.test.ts
git commit -m "feat: add vendor mappings CRUD, bulk recategorize, and PFC resolution logic"
```

---

### Task 16: `manualTransactionRepository` + `manualTransactions` router

**Files:**
- Create: `backend/src/repositories/manualTransactionRepository.ts`
- Create: `backend/src/routers/manualTransactions.ts`
- Test: `backend/src/routers/manualTransactions.test.ts`

**Interfaces:**
- Consumes: `getScopedClient` (Task 5).
- Produces: `manualTransactionRepository.list/create/update/delete(jwt, userId, ...)` over `manual_transactions`. tRPC router `manualTransactions` with `list`, `create`, `update`, `delete` — used by `router.ts` (Task 21) and referenced by `reimbursementRepository` (Task 19) as a linkable transaction side.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/manualTransactionRepository.js', () => ({ manualTransactionRepository: repoMock }))

describe('manualTransactions router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('create defaults amount to a positive value regardless of type', async () => {
    repoMock.create.mockResolvedValue({ id: 'mt-1', amount: '5.00', type: 'expense', categoryId: 'cat-1', subcategoryId: null, date: '2026-06-21', note: 'Street food' })
    const { manualTransactionsRouter } = await import('./manualTransactions.js')
    const caller = manualTransactionsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    await caller.create({ amount: '5.00', type: 'expense', categoryId: 'cat-1', subcategoryId: null, date: '2026-06-21', note: 'Street food' })

    expect(repoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', {
      amount: '5.00',
      type: 'expense',
      categoryId: 'cat-1',
      subcategoryId: null,
      date: '2026-06-21',
      note: 'Street food',
    })
  })

  it('rejects a negative amount at the input-validation layer', async () => {
    const { manualTransactionsRouter } = await import('./manualTransactions.js')
    const caller = manualTransactionsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    await expect(
      caller.create({ amount: '-5.00', type: 'expense', categoryId: 'cat-1', subcategoryId: null, date: '2026-06-21', note: null }),
    ).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routers/manualTransactions.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/repositories/manualTransactionRepository.ts
import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface ManualTransaction {
  id: string
  amount: string
  type: 'expense' | 'income'
  categoryId: string | null
  subcategoryId: string | null
  date: string
  note: string | null
}

function fromRow(row: {
  id: string
  amount: string
  type: string
  category_id: string | null
  subcategory_id: string | null
  date: string
  note: string | null
}): ManualTransaction {
  return {
    id: row.id,
    amount: row.amount,
    type: row.type as 'expense' | 'income',
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    date: row.date,
    note: row.note,
  }
}

const COLUMNS = 'id, amount, type, category_id, subcategory_id, date, note'

export const manualTransactionRepository = {
  async list(jwt: string): Promise<ManualTransaction[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('manual_transactions').select(COLUMNS).order('date', { ascending: false })
    if (error) throw error
    return data.map(fromRow)
  },

  async create(
    jwt: string,
    userId: string,
    input: { amount: string; type: 'expense' | 'income'; categoryId: string | null; subcategoryId: string | null; date: string; note: string | null },
  ): Promise<ManualTransaction> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('manual_transactions')
      .insert({
        user_id: userId,
        amount: input.amount,
        type: input.type,
        category_id: input.categoryId,
        subcategory_id: input.subcategoryId,
        date: input.date,
        note: input.note,
      })
      .select(COLUMNS)
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async update(
    jwt: string,
    id: string,
    input: Partial<{ amount: string; type: 'expense' | 'income'; categoryId: string | null; subcategoryId: string | null; date: string; note: string | null }>,
  ): Promise<ManualTransaction> {
    const client = getScopedClient(jwt)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.amount !== undefined) patch.amount = input.amount
    if (input.type !== undefined) patch.type = input.type
    if (input.categoryId !== undefined) patch.category_id = input.categoryId
    if (input.subcategoryId !== undefined) patch.subcategory_id = input.subcategoryId
    if (input.date !== undefined) patch.date = input.date
    if (input.note !== undefined) patch.note = input.note

    const { data, error } = await client.from('manual_transactions').update(patch).eq('id', id).select(COLUMNS).single()
    if (error) throw error
    return fromRow(data)
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('manual_transactions').delete().eq('id', id)
    if (error) throw error
  },
}
```

```ts
// backend/src/routers/manualTransactions.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { manualTransactionRepository } from '../repositories/manualTransactionRepository.js'

const amountSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a positive decimal')

export const manualTransactionsRouter = router({
  list: protectedProcedure.query(({ ctx }) => manualTransactionRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(
      z.object({
        amount: amountSchema,
        type: z.enum(['expense', 'income']),
        categoryId: z.string().uuid().nullable(),
        subcategoryId: z.string().uuid().nullable(),
        date: z.string(),
        note: z.string().nullable(),
      }),
    )
    .mutation(({ ctx, input }) => manualTransactionRepository.create(ctx.jwt, ctx.userId, input)),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        amount: amountSchema.optional(),
        type: z.enum(['expense', 'income']).optional(),
        categoryId: z.string().uuid().nullable().optional(),
        subcategoryId: z.string().uuid().nullable().optional(),
        date: z.string().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input
      return manualTransactionRepository.update(ctx.jwt, id, patch)
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => manualTransactionRepository.delete(ctx.jwt, input.id)),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routers/manualTransactions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/manualTransactionRepository.ts backend/src/routers/manualTransactions.ts backend/src/routers/manualTransactions.test.ts
git commit -m "feat: add manual transactions CRUD"
```

---

### Task 17: `transactionOverrideRepository` + `transactionOverrides` router

**Files:**
- Create: `backend/src/repositories/transactionOverrideRepository.ts`
- Create: `backend/src/routers/transactionOverrides.ts`
- Test: `backend/src/routers/transactionOverrides.test.ts`

**Interfaces:**
- Consumes: `getScopedClient` (Task 5).
- Produces: `transactionOverrideRepository.list/upsert/delete(jwt, userId, ...)` over `transaction_overrides`, keyed by `plaid_transaction_id`. tRPC router `transactionOverrides` — used by `router.ts` (Task 21); this is the highest-priority entry in the client-side category resolution order (product.md Feature 2).

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), upsert: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/transactionOverrideRepository.js', () => ({ transactionOverrideRepository: repoMock }))

describe('transactionOverrides router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('upsert writes a per-transaction override keyed by the opaque Plaid transaction id', async () => {
    repoMock.upsert.mockResolvedValue({ id: 'to-1', plaidTransactionId: 'plaid-tx-1', categoryId: 'cat-1', subcategoryId: null })
    const { transactionOverridesRouter } = await import('./transactionOverrides.js')
    const caller = transactionOverridesRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    await caller.upsert({ plaidTransactionId: 'plaid-tx-1', categoryId: 'cat-1', subcategoryId: null })

    expect(repoMock.upsert).toHaveBeenCalledWith('jwt-1', 'user-1', {
      plaidTransactionId: 'plaid-tx-1',
      categoryId: 'cat-1',
      subcategoryId: null,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/routers/transactionOverrides.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/repositories/transactionOverrideRepository.ts
import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface TransactionOverride {
  id: string
  plaidTransactionId: string
  categoryId: string | null
  subcategoryId: string | null
}

function fromRow(row: { id: string; plaid_transaction_id: string; category_id: string | null; subcategory_id: string | null }): TransactionOverride {
  return { id: row.id, plaidTransactionId: row.plaid_transaction_id, categoryId: row.category_id, subcategoryId: row.subcategory_id }
}

export const transactionOverrideRepository = {
  async list(jwt: string): Promise<TransactionOverride[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('transaction_overrides').select('id, plaid_transaction_id, category_id, subcategory_id')
    if (error) throw error
    return data.map(fromRow)
  },

  async upsert(
    jwt: string,
    userId: string,
    input: { plaidTransactionId: string; categoryId: string | null; subcategoryId: string | null },
  ): Promise<TransactionOverride> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('transaction_overrides')
      .upsert(
        { user_id: userId, plaid_transaction_id: input.plaidTransactionId, category_id: input.categoryId, subcategory_id: input.subcategoryId },
        { onConflict: 'user_id,plaid_transaction_id' },
      )
      .select('id, plaid_transaction_id, category_id, subcategory_id')
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('transaction_overrides').delete().eq('id', id)
    if (error) throw error
  },
}
```

```ts
// backend/src/routers/transactionOverrides.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { transactionOverrideRepository } from '../repositories/transactionOverrideRepository.js'

export const transactionOverridesRouter = router({
  list: protectedProcedure.query(({ ctx }) => transactionOverrideRepository.list(ctx.jwt)),

  upsert: protectedProcedure
    .input(z.object({ plaidTransactionId: z.string().min(1), categoryId: z.string().uuid().nullable(), subcategoryId: z.string().uuid().nullable() }))
    .mutation(({ ctx, input }) => transactionOverrideRepository.upsert(ctx.jwt, ctx.userId, input)),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => transactionOverrideRepository.delete(ctx.jwt, input.id)),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/routers/transactionOverrides.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/transactionOverrideRepository.ts backend/src/routers/transactionOverrides.ts backend/src/routers/transactionOverrides.test.ts
git commit -m "feat: add per-transaction category override CRUD"
```

---

### Task 18: `budgetRepository` + `budgetService` + `budgets` router

**Files:**
- Create: `backend/src/repositories/budgetRepository.ts`
- Create: `backend/src/services/budgetService.ts`
- Create: `backend/src/routers/budgets.ts`
- Test: `backend/src/services/budgetService.test.ts`
- Test: `backend/src/routers/budgets.test.ts`

**Interfaces:**
- Consumes: `getScopedClient` (Task 5), `toCents`/`fromCents` (Task 2).
- Produces: `budgetRepository.list/create/update/delete(jwt, userId, ...)`. `budgetService.calculateProgress(budget, spentAmount): { spentCents, budgetCents, percent, status: 'on_track' | 'approaching' | 'over' }` — pure calculation, thresholds per design.md (teal <70%, amber 70–90%, rose >90%). tRPC router `budgets` with `list`, `create`, `update`, `delete`, `spendCalculations` — used by `router.ts` (Task 21).

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/budgetService.test.ts
import { describe, expect, it } from 'vitest'
import { budgetService } from './budgetService.js'

describe('budgetService.calculateProgress', () => {
  it('reports on_track under 70% spent', () => {
    const result = budgetService.calculateProgress({ amount: '200.00' }, '127.40')
    expect(result.status).toBe('on_track')
    expect(result.percent).toBeCloseTo(63.7, 1)
  })

  it('reports approaching between 70% and 90% spent', () => {
    const result = budgetService.calculateProgress({ amount: '175.00' }, '152.00')
    expect(result.status).toBe('approaching')
  })

  it('reports over above 90% spent', () => {
    const result = budgetService.calculateProgress({ amount: '200.00' }, '320.00')
    expect(result.status).toBe('over')
    expect(result.percent).toBeCloseTo(160, 0)
  })

  it('handles a zero budget without dividing by zero', () => {
    const result = budgetService.calculateProgress({ amount: '0.00' }, '10.00')
    expect(result.percent).toBe(Infinity)
    expect(result.status).toBe('over')
  })
})
```

```ts
// backend/src/routers/budgets.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repoMock = { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
vi.mock('../repositories/budgetRepository.js', () => ({ budgetRepository: repoMock }))

describe('budgets router', () => {
  beforeEach(() => vi.clearAllMocks())

  it('create scopes the budget to the caller\'s user id', async () => {
    repoMock.create.mockResolvedValue({ id: 'b1', categoryId: 'cat-1', amount: '200.00', period: 'monthly' })
    const { budgetsRouter } = await import('./budgets.js')
    const caller = budgetsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    await caller.create({ categoryId: 'cat-1', amount: '200.00', period: 'monthly' })

    expect(repoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', { categoryId: 'cat-1', amount: '200.00', period: 'monthly' })
  })

  it('spendCalculations combines each budget with its computed progress', async () => {
    repoMock.list.mockResolvedValue([{ id: 'b1', categoryId: 'cat-1', amount: '200.00', period: 'monthly' }])
    const { budgetsRouter } = await import('./budgets.js')
    const caller = budgetsRouter.createCaller({ userId: 'user-1', jwt: 'jwt-1' })

    const result = await caller.spendCalculations({ spendByCategory: { 'cat-1': '127.40' } })

    expect(result).toEqual([
      expect.objectContaining({ id: 'b1', categoryId: 'cat-1', amount: '200.00', status: 'on_track' }),
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/budgetService.test.ts src/routers/budgets.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/repositories/budgetRepository.ts
import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface Budget {
  id: string
  categoryId: string
  amount: string
  period: 'monthly' | 'weekly' | 'yearly'
}

function fromRow(row: { id: string; category_id: string; amount: string; period: string }): Budget {
  return { id: row.id, categoryId: row.category_id, amount: row.amount, period: row.period as Budget['period'] }
}

export const budgetRepository = {
  async list(jwt: string): Promise<Budget[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('budgets').select('id, category_id, amount, period')
    if (error) throw error
    return data.map(fromRow)
  },

  async create(jwt: string, userId: string, input: { categoryId: string; amount: string; period: Budget['period'] }): Promise<Budget> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('budgets')
      .insert({ user_id: userId, category_id: input.categoryId, amount: input.amount, period: input.period })
      .select('id, category_id, amount, period')
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async update(jwt: string, id: string, input: Partial<{ amount: string; period: Budget['period'] }>): Promise<Budget> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('budgets').update(input).eq('id', id).select('id, category_id, amount, period').single()
    if (error) throw error
    return fromRow(data)
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('budgets').delete().eq('id', id)
    if (error) throw error
  },
}
```

```ts
// backend/src/services/budgetService.ts
import { toCents } from '../lib/money.js'

export type BudgetStatus = 'on_track' | 'approaching' | 'over'

export const budgetService = {
  calculateProgress(
    budget: { amount: string },
    spentAmount: string,
  ): { spentCents: number; budgetCents: number; percent: number; status: BudgetStatus } {
    const budgetCents = toCents(budget.amount)
    const spentCents = toCents(spentAmount)
    const percent = budgetCents === 0 ? Infinity : (spentCents / budgetCents) * 100
    const status: BudgetStatus = percent > 90 ? 'over' : percent >= 70 ? 'approaching' : 'on_track'
    return { spentCents, budgetCents, percent, status }
  },
}
```

```ts
// backend/src/routers/budgets.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { budgetRepository } from '../repositories/budgetRepository.js'
import { budgetService } from '../services/budgetService.js'

export const budgetsRouter = router({
  list: protectedProcedure.query(({ ctx }) => budgetRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(z.object({ categoryId: z.string().uuid(), amount: z.string(), period: z.enum(['monthly', 'weekly', 'yearly']) }))
    .mutation(({ ctx, input }) => budgetRepository.create(ctx.jwt, ctx.userId, input)),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), amount: z.string().optional(), period: z.enum(['monthly', 'weekly', 'yearly']).optional() }))
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input
      return budgetRepository.update(ctx.jwt, id, patch)
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => budgetRepository.delete(ctx.jwt, input.id)),

  // spendByCategory is computed client-side from the on-device transaction cache (never persisted
  // server-side — see architecture.md) and passed in so this stays a pure calculation over live data.
  spendCalculations: protectedProcedure
    .input(z.object({ spendByCategory: z.record(z.string()) }))
    .query(async ({ ctx, input }) => {
      const budgets = await budgetRepository.list(ctx.jwt)
      return budgets.map((budget) => ({
        ...budget,
        ...budgetService.calculateProgress(budget, input.spendByCategory[budget.categoryId] ?? '0.00'),
      }))
    }),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/budgetService.test.ts src/routers/budgets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/budgetRepository.ts backend/src/services/budgetService.ts backend/src/routers/budgets.ts backend/src/services/budgetService.test.ts backend/src/routers/budgets.test.ts
git commit -m "feat: add budgets CRUD and spend/progress calculation"
```

---

### Task 19: `reimbursementRepository` + `reimbursementService` + `reimbursements` router

**Files:**
- Create: `backend/src/repositories/reimbursementRepository.ts`
- Create: `backend/src/services/reimbursementService.ts`
- Create: `backend/src/routers/reimbursements.ts`
- Test: `backend/src/services/reimbursementService.test.ts`
- Test: `backend/src/routers/reimbursements.test.ts`

**Interfaces:**
- Consumes: `getScopedClient` (Task 5), `toCents`/`fromCents` (Task 2).
- Produces: `reimbursementRepository.list/create/delete(jwt, userId, ...)` over `reimbursements`, enforcing the "exactly one of Plaid/manual ID per side" shape at the application layer (mirroring the DB CHECK constraint from Task 4). `reimbursementService.calculateNetExpense(originalAmount, reimbursements): string` — net = original − sum(linked amounts), per product.md Feature 8's `$100 − $60 = $40` example. tRPC router `reimbursements` with `list`, `create`, `delete`, `netExpense` — used by `router.ts` (Task 21).

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/reimbursementService.test.ts
import { describe, expect, it } from 'vitest'
import { reimbursementService } from './reimbursementService.js'

describe('reimbursementService.calculateNetExpense', () => {
  it('subtracts every linked reimbursement amount from the original expense', () => {
    const net = reimbursementService.calculateNetExpense('100.00', [{ amount: '30.00' }, { amount: '30.00' }])
    expect(net).toBe('40.00')
  })

  it('returns the full original amount when nothing is linked yet', () => {
    expect(reimbursementService.calculateNetExpense('100.00', [])).toBe('100.00')
  })

  it('never goes negative even if reimbursements exceed the original (data-entry edge case)', () => {
    expect(reimbursementService.calculateNetExpense('40.00', [{ amount: '50.00' }])).toBe('0.00')
  })
})
```

```ts
// backend/src/repositories/reimbursementRepository.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const insertMock = vi.fn()
const supabaseClientMock = { from: vi.fn(() => ({ insert: insertMock })) }
vi.mock('../lib/supabase/scopedClient.js', () => ({ getScopedClient: vi.fn(() => supabaseClientMock) }))

describe('reimbursementRepository.create', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects when both a Plaid and a manual id are given for the expense side', async () => {
    const { reimbursementRepository } = await import('./reimbursementRepository.js')

    await expect(
      reimbursementRepository.create('jwt-1', 'user-1', {
        expensePlaidTransactionId: 'plaid-tx-1',
        expenseManualTransactionId: 'manual-1',
        incomePlaidTransactionId: 'plaid-tx-2',
        incomeManualTransactionId: null,
        amount: '30.00',
        note: null,
      }),
    ).rejects.toThrow(/exactly one/i)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('rejects when neither side has an id', async () => {
    const { reimbursementRepository } = await import('./reimbursementRepository.js')

    await expect(
      reimbursementRepository.create('jwt-1', 'user-1', {
        expensePlaidTransactionId: null,
        expenseManualTransactionId: null,
        incomePlaidTransactionId: 'plaid-tx-2',
        incomeManualTransactionId: null,
        amount: '30.00',
        note: null,
      }),
    ).rejects.toThrow(/exactly one/i)
  })

  it('accepts a valid Plaid-expense / manual-income pairing (cash reimbursement)', async () => {
    const single = vi.fn().mockResolvedValue({
      data: { id: 'r1', expense_plaid_transaction_id: 'plaid-tx-1', expense_manual_transaction_id: null, income_plaid_transaction_id: null, income_manual_transaction_id: 'manual-2', amount: '30.00', note: null },
      error: null,
    })
    const select = vi.fn(() => ({ single }))
    insertMock.mockReturnValue({ select })

    const { reimbursementRepository } = await import('./reimbursementRepository.js')
    const result = await reimbursementRepository.create('jwt-1', 'user-1', {
      expensePlaidTransactionId: 'plaid-tx-1',
      expenseManualTransactionId: null,
      incomePlaidTransactionId: null,
      incomeManualTransactionId: 'manual-2',
      amount: '30.00',
      note: null,
    })

    expect(result.id).toBe('r1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/reimbursementService.test.ts src/repositories/reimbursementRepository.test.ts`
Expected: FAIL — files do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/reimbursementService.ts
import { fromCents, toCents } from '../lib/money.js'

export const reimbursementService = {
  calculateNetExpense(originalAmount: string, reimbursements: Array<{ amount: string }>): string {
    const originalCents = toCents(originalAmount)
    const reimbursedCents = reimbursements.reduce((sum, r) => sum + toCents(r.amount), 0)
    return fromCents(Math.max(0, originalCents - reimbursedCents))
  },
}
```

```ts
// backend/src/repositories/reimbursementRepository.ts
import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface Reimbursement {
  id: string
  expensePlaidTransactionId: string | null
  expenseManualTransactionId: string | null
  incomePlaidTransactionId: string | null
  incomeManualTransactionId: string | null
  amount: string
  note: string | null
}

export interface ReimbursementInput {
  expensePlaidTransactionId: string | null
  expenseManualTransactionId: string | null
  incomePlaidTransactionId: string | null
  incomeManualTransactionId: string | null
  amount: string
  note: string | null
}

function exactlyOne(a: unknown, b: unknown): boolean {
  return (a !== null) !== (b !== null)
}

function fromRow(row: {
  id: string
  expense_plaid_transaction_id: string | null
  expense_manual_transaction_id: string | null
  income_plaid_transaction_id: string | null
  income_manual_transaction_id: string | null
  amount: string
  note: string | null
}): Reimbursement {
  return {
    id: row.id,
    expensePlaidTransactionId: row.expense_plaid_transaction_id,
    expenseManualTransactionId: row.expense_manual_transaction_id,
    incomePlaidTransactionId: row.income_plaid_transaction_id,
    incomeManualTransactionId: row.income_manual_transaction_id,
    amount: row.amount,
    note: row.note,
  }
}

export const reimbursementRepository = {
  async list(jwt: string): Promise<Reimbursement[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('reimbursements')
      .select('id, expense_plaid_transaction_id, expense_manual_transaction_id, income_plaid_transaction_id, income_manual_transaction_id, amount, note')
    if (error) throw error
    return data.map(fromRow)
  },

  async create(jwt: string, userId: string, input: ReimbursementInput): Promise<Reimbursement> {
    if (!exactlyOne(input.expensePlaidTransactionId, input.expenseManualTransactionId)) {
      throw new Error('Exactly one of expensePlaidTransactionId/expenseManualTransactionId must be set')
    }
    if (!exactlyOne(input.incomePlaidTransactionId, input.incomeManualTransactionId)) {
      throw new Error('Exactly one of incomePlaidTransactionId/incomeManualTransactionId must be set')
    }

    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('reimbursements')
      .insert({
        user_id: userId,
        expense_plaid_transaction_id: input.expensePlaidTransactionId,
        expense_manual_transaction_id: input.expenseManualTransactionId,
        income_plaid_transaction_id: input.incomePlaidTransactionId,
        income_manual_transaction_id: input.incomeManualTransactionId,
        amount: input.amount,
        note: input.note,
      })
      .select('id, expense_plaid_transaction_id, expense_manual_transaction_id, income_plaid_transaction_id, income_manual_transaction_id, amount, note')
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('reimbursements').delete().eq('id', id)
    if (error) throw error
  },
}
```

```ts
// backend/src/routers/reimbursements.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { reimbursementRepository } from '../repositories/reimbursementRepository.js'
import { reimbursementService } from '../services/reimbursementService.js'

const reimbursementInputSchema = z.object({
  expensePlaidTransactionId: z.string().nullable(),
  expenseManualTransactionId: z.string().uuid().nullable(),
  incomePlaidTransactionId: z.string().nullable(),
  incomeManualTransactionId: z.string().uuid().nullable(),
  amount: z.string(),
  note: z.string().nullable(),
})

export const reimbursementsRouter = router({
  list: protectedProcedure.query(({ ctx }) => reimbursementRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(reimbursementInputSchema)
    .mutation(({ ctx, input }) => reimbursementRepository.create(ctx.jwt, ctx.userId, input)),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => reimbursementRepository.delete(ctx.jwt, input.id)),

  netExpense: protectedProcedure
    .input(z.object({ originalAmount: z.string(), linkedAmounts: z.array(z.string()) }))
    .query(({ input }) =>
      reimbursementService.calculateNetExpense(input.originalAmount, input.linkedAmounts.map((amount) => ({ amount }))),
    ),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/reimbursementService.test.ts src/repositories/reimbursementRepository.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/reimbursementRepository.ts backend/src/services/reimbursementService.ts backend/src/routers/reimbursements.ts backend/src/services/reimbursementService.test.ts backend/src/repositories/reimbursementRepository.test.ts
git commit -m "feat: add reimbursements CRUD, XOR-linkage validation, and net-expense calculation"
```

---

### Task 20: `onboardingService` + `onboarding` router

**Files:**
- Create: `backend/src/services/onboardingService.ts`
- Create: `backend/src/routers/onboarding.ts`
- Test: `backend/src/services/onboardingService.test.ts`
- Test: `backend/src/routers/onboarding.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_PFC_MAPPING` (Task 7), `categoryRepository.create`/`subcategoryRepository.create` (Task 13), `plaidCategoryMappingRepository.create` (Task 14), `vendorMappingRepository.upsert` (Task 15), `categorizationService.resolveCategory` (Task 15).
- Produces: `onboardingService.seedCategories(jwt, userId): Promise<{ categoryIdsByLedgeName: Record<string, string> }>` (product.md Feature 3, Step 1). `onboardingService.generateVendorMappings(jwt, userId, transactions): Promise<{ createdCount: number }>` (Step 2 — dedupes one mapping per `merchant_name`, first match wins). tRPC router `onboarding` with `seedCategories`, `generateVendorMappings` — used by `router.ts` (Task 21).

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/services/onboardingService.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const categoryRepoMock = { create: vi.fn() }
const subcategoryRepoMock = { create: vi.fn() }
const pfcMappingRepoMock = { create: vi.fn() }
const vendorMappingRepoMock = { upsert: vi.fn() }

vi.mock('../repositories/categoryRepository.js', () => ({ categoryRepository: categoryRepoMock }))
vi.mock('../repositories/subcategoryRepository.js', () => ({ subcategoryRepository: subcategoryRepoMock }))
vi.mock('../repositories/plaidCategoryMappingRepository.js', () => ({ plaidCategoryMappingRepository: pfcMappingRepoMock }))
vi.mock('../repositories/vendorMappingRepository.js', () => ({ vendorMappingRepository: vendorMappingRepoMock }))

describe('onboardingService.seedCategories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates one category per DEFAULT_PFC_MAPPING entry, plus its subcategories and PFC mappings', async () => {
    let categoryCounter = 0
    categoryRepoMock.create.mockImplementation(async (_jwt: string, _userId: string, input: { name: string }) => ({
      id: `cat-${++categoryCounter}`,
      ...input,
    }))
    subcategoryRepoMock.create.mockResolvedValue({ id: 'sub-1', categoryId: 'cat-1', name: 'Restaurants' })
    pfcMappingRepoMock.create.mockResolvedValue({})

    const { onboardingService } = await import('./onboardingService.js')
    const result = await onboardingService.seedCategories('jwt-1', 'user-1')

    expect(categoryRepoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', {
      name: 'Food & Drink',
      color: '#F97316',
      icon: '🍽',
    })
    expect(pfcMappingRepoMock.create).toHaveBeenCalledWith('jwt-1', 'user-1', {
      plaidPfcPrimary: 'FOOD_AND_DRINK',
      plaidPfcDetailed: 'FOOD_AND_DRINK_RESTAURANTS',
      categoryId: 'cat-1',
    })
    expect(result.categoryIdsByLedgeName['Food & Drink']).toBe('cat-1')
  })
})

describe('onboardingService.generateVendorMappings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('writes one plaid_auto vendor mapping per unique merchant, first match wins', async () => {
    pfcMappingRepoMock.list = vi.fn().mockResolvedValue([
      { id: 'm1', plaidPfcPrimary: 'FOOD_AND_DRINK', plaidPfcDetailed: 'FOOD_AND_DRINK_COFFEE', categoryId: 'cat-coffee' },
    ])
    vi.doMock('../repositories/plaidCategoryMappingRepository.js', () => ({ plaidCategoryMappingRepository: pfcMappingRepoMock }))
    vendorMappingRepoMock.upsert.mockResolvedValue({})

    const { onboardingService } = await import('./onboardingService.js')
    const result = await onboardingService.generateVendorMappings('jwt-1', 'user-1', [
      { merchant_name: 'Blue Bottle', personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' } },
      { merchant_name: 'Blue Bottle', personal_finance_category: { primary: 'FOOD_AND_DRINK', detailed: 'FOOD_AND_DRINK_COFFEE' } },
    ])

    expect(vendorMappingRepoMock.upsert).toHaveBeenCalledTimes(1)
    expect(vendorMappingRepoMock.upsert).toHaveBeenCalledWith('jwt-1', 'user-1', {
      vendorName: 'Blue Bottle',
      categoryId: 'cat-coffee',
      subcategoryId: null,
      source: 'plaid_auto',
    })
    expect(result).toEqual({ createdCount: 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/onboardingService.test.ts`
Expected: FAIL — `onboardingService.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/services/onboardingService.ts
import { DEFAULT_PFC_MAPPING } from '../lib/plaid/pfc.js'
import { categoryRepository } from '../repositories/categoryRepository.js'
import { subcategoryRepository } from '../repositories/subcategoryRepository.js'
import { plaidCategoryMappingRepository } from '../repositories/plaidCategoryMappingRepository.js'
import { vendorMappingRepository } from '../repositories/vendorMappingRepository.js'
import { categorizationService } from './categorizationService.js'

interface PlaidTransactionLike {
  merchant_name: string | null
  personal_finance_category: { primary: string; detailed: string }
}

export const onboardingService = {
  async seedCategories(jwt: string, userId: string): Promise<{ categoryIdsByLedgeName: Record<string, string> }> {
    const categoryIdsByLedgeName: Record<string, string> = {}

    for (const entry of DEFAULT_PFC_MAPPING) {
      const category = await categoryRepository.create(jwt, userId, {
        name: entry.ledgeCategory,
        color: entry.color,
        icon: entry.icon,
      })
      categoryIdsByLedgeName[entry.ledgeCategory] = category.id

      for (const subcategoryName of entry.subcategories) {
        await subcategoryRepository.create(jwt, userId, { categoryId: category.id, name: subcategoryName })
      }

      // One row per detailed PFC code — matches architecture.md's "detailed overrides primary" rule
      // by only ever writing detailed-level rows during default seeding (no primary-only fallback row).
      for (const detailedCode of entry.detailedCodes) {
        await plaidCategoryMappingRepository.create(jwt, userId, {
          plaidPfcPrimary: entry.primary,
          plaidPfcDetailed: detailedCode,
          categoryId: category.id,
        })
      }
    }

    return { categoryIdsByLedgeName }
  },

  async generateVendorMappings(
    jwt: string,
    userId: string,
    transactions: PlaidTransactionLike[],
  ): Promise<{ createdCount: number }> {
    const mappings = await plaidCategoryMappingRepository.list(jwt)
    const seenVendors = new Set<string>()
    let createdCount = 0

    for (const transaction of transactions) {
      const vendorName = transaction.merchant_name
      if (!vendorName || seenVendors.has(vendorName)) continue

      const resolved = categorizationService.resolveCategory(mappings, transaction.personal_finance_category)
      if (!resolved) continue

      await vendorMappingRepository.upsert(jwt, userId, {
        vendorName,
        categoryId: resolved.categoryId,
        subcategoryId: null,
        source: 'plaid_auto',
      })
      seenVendors.add(vendorName)
      createdCount += 1
    }

    return { createdCount }
  },
}
```


```ts
// backend/src/routers/onboarding.ts
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { onboardingService } from '../services/onboardingService.js'

export const onboardingRouter = router({
  seedCategories: protectedProcedure.mutation(({ ctx }) => onboardingService.seedCategories(ctx.jwt, ctx.userId)),

  generateVendorMappings: protectedProcedure
    .input(
      z.object({
        transactions: z.array(
          z.object({
            merchant_name: z.string().nullable(),
            personal_finance_category: z.object({ primary: z.string(), detailed: z.string() }),
          }),
        ),
      }),
    )
    .mutation(({ ctx, input }) => onboardingService.generateVendorMappings(ctx.jwt, ctx.userId, input.transactions)),
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/onboardingService.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/onboardingService.ts backend/src/routers/onboarding.ts backend/src/services/onboardingService.test.ts backend/src/lib/plaid/pfc.ts
git commit -m "feat: add onboarding category seeding and first-sync vendor mapping generation"
```

---

### Task 21: tRPC root router + Fastify server wiring

**Files:**
- Create: `backend/src/trpc/router.ts`
- Create: `backend/src/server.ts`
- Test: `backend/src/server.test.ts`

**Interfaces:**
- Consumes: every router from Tasks 9–20 (`plaidCredentialsRouter`, `plaidLinkRouter`, `transactionsRouter`, `accountsRouter`, `categoriesRouter`, `subcategoriesRouter`, `plaidCategoryMappingsRouter`, `vendorMappingsRouter`, `manualTransactionsRouter`, `transactionOverridesRouter`, `budgetsRouter`, `reimbursementsRouter`, `onboardingRouter`), `createContext` (Task 6).
- Produces: `appRouter` (the full combined `AppRouter` type, for the mobile tRPC client to consume) and a running Fastify instance on `PORT`.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/server.test.ts
import { describe, expect, it } from 'vitest'
import { buildServer } from './server.js'

describe('server', () => {
  it('responds 401 on a protected tRPC route with no Authorization header', async () => {
    process.env.SUPABASE_JWT_SECRET = 'test-secret'
    const server = buildServer()
    const response = await server.inject({ method: 'GET', url: '/trpc/categories.list' })
    expect(response.statusCode).toBe(401)
    await server.close()
  })

  it('responds 200 on the health check with no auth required', async () => {
    const server = buildServer()
    const response = await server.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    await server.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/server.test.ts`
Expected: FAIL — `server.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// backend/src/trpc/router.ts
import { router } from './trpc.js'
import { plaidCredentialsRouter } from '../routers/plaidCredentials.js'
import { plaidLinkRouter } from '../routers/plaidLink.js'
import { transactionsRouter } from '../routers/transactions.js'
import { accountsRouter } from '../routers/accounts.js'
import { categoriesRouter } from '../routers/categories.js'
import { subcategoriesRouter } from '../routers/subcategories.js'
import { plaidCategoryMappingsRouter } from '../routers/plaidCategoryMappings.js'
import { vendorMappingsRouter } from '../routers/vendorMappings.js'
import { manualTransactionsRouter } from '../routers/manualTransactions.js'
import { transactionOverridesRouter } from '../routers/transactionOverrides.js'
import { budgetsRouter } from '../routers/budgets.js'
import { reimbursementsRouter } from '../routers/reimbursements.js'
import { onboardingRouter } from '../routers/onboarding.js'

export const appRouter = router({
  plaidCredentials: plaidCredentialsRouter,
  plaidLink: plaidLinkRouter,
  transactions: transactionsRouter,
  accounts: accountsRouter,
  categories: categoriesRouter,
  subcategories: subcategoriesRouter,
  plaidCategoryMappings: plaidCategoryMappingsRouter,
  vendorMappings: vendorMappingsRouter,
  manualTransactions: manualTransactionsRouter,
  transactionOverrides: transactionOverridesRouter,
  budgets: budgetsRouter,
  reimbursements: reimbursementsRouter,
  onboarding: onboardingRouter,
})

export type AppRouter = typeof appRouter
```

```ts
// backend/src/server.ts
import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { appRouter } from './trpc/router.js'
import { createContext } from './trpc/context.js'

export function buildServer() {
  const server = Fastify({ logger: true })

  server.register(cors, { origin: true })

  server.get('/health', async () => ({ status: 'ok' }))

  server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: appRouter, createContext },
  })

  return server
}

async function start() {
  const server = buildServer()
  const port = Number(process.env.PORT) || 3000
  await server.listen({ port, host: '0.0.0.0' })
}

if (process.env.NODE_ENV !== 'test') {
  start()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/server.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: PASS — every test file from Tasks 2–21 passes together.

- [ ] **Step 6: Commit**

```bash
git add backend/src/trpc/router.ts backend/src/server.ts backend/src/server.test.ts
git commit -m "feat: wire full tRPC root router into the Fastify server"
```

---

## Follow-ups Explicitly Out of Scope Here

- No Drizzle migration has been run against a real Supabase instance — Task 4's Step 5 only generates SQL locally. Running `npm run db:migrate` against a live `DATABASE_URL`, and writing the matching RLS policies (`auth.uid() = user_id`) and the two CHECK constraints as actual Postgres migrations, is required before any endpoint is usable end-to-end.
- No mobile app work (per the user's chosen scope for this plan).
- Push notifications for budget thresholds (product.md Feature 7's "optional" 80%/100% notification) are not implemented — no router/service exists for them yet.
