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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// Supabase's auth.users, referenced for FKs only — never written to by this app.
// Declared locally (rather than imported from drizzle-orm/supabase) so every table
// in this file resolves PgColumn/PgTable types from the exact same 'drizzle-orm/pg-core'
// module graph; mixing that import with a second subpath ('drizzle-orm/supabase') triggers
// a TypeScript nodenext dual-resolution identity split in some build environments (seen on
// Vercel, not reproducible locally even with matching Node version + a forced clean install).
// Running `npm run db:generate` after schema changes may re-emit a CREATE TABLE for this
// table — strip that statement by hand before applying, since Supabase owns that schema.
const authSchema = pgSchema('auth')
const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
})

// Developer allowlist. Only these accounts may choose the sandbox Plaid environment; everyone
// else is pinned to production. Seeded by hand via SQL — deliberately not writable from the app.
// The lowercase check is a guardrail: lookups normalise the incoming email, so a mixed-case row
// would silently never match. Better to reject the bad INSERT than to debug a dev who can't
// see the toggle.
export const devEmails = pgTable('dev_emails', {
  email: text('email').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  lowercase: check('dev_emails_lowercase', sql`${table.email} = lower(${table.email})`),
}))

export const plaidCredentials = pgTable('plaid_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id).unique(),
  clientId: text('client_id').notNull(),
  encryptedSecret: text('encrypted_secret').notNull(),
  environment: text('environment').notNull(), // 'sandbox' | 'production' — fixed at first save, never updated
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
}, (table) => ({
  uniqueTransactionOverride: unique().on(table.userId, table.plaidTransactionId),
}))

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

// A transfer between the user's own accounts (or a credit card payment) shows up twice in the
// feed — once as an expense on the source account, once as income on the destination. Both legs
// are excluded from spend/income totals. Shaped like `reimbursements`, with two differences:
// the income leg is OPTIONAL (transfers to an account the user hasn't connected have no second
// leg to link), and `kind` records which transfer type it is.
export const transfers = pgTable('transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  kind: text('kind').notNull(),
  // 'manual' = created through the TransferSheet; 'auto' = created by transfer auto-detection
  // (docs/credit-card-payment-auto-transfer.md). Lets the UI badge auto matches and offer undo.
  source: text('source').notNull().default('manual'),
  expensePlaidTransactionId: text('expense_plaid_transaction_id'),
  // Cascade, unlike reimbursements: deleting a manual transaction must not be blocked by the
  // transfer row that references it. Removing a leg removes the transfer entirely, which is
  // what unmarking means anyway.
  expenseManualTransactionId: uuid('expense_manual_transaction_id').references(() => manualTransactions.id, { onDelete: 'cascade' }),
  incomePlaidTransactionId: text('income_plaid_transaction_id'),
  incomeManualTransactionId: uuid('income_manual_transaction_id').references(() => manualTransactions.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  expenseXor: check(
    'transfer_expense_xor',
    sql`(${table.expensePlaidTransactionId} IS NOT NULL) <> (${table.expenseManualTransactionId} IS NOT NULL)`,
  ),
  // At most one — both null is the valid "unpaired transfer" case.
  incomeNotBoth: check(
    'transfer_income_not_both',
    sql`NOT (${table.incomePlaidTransactionId} IS NOT NULL AND ${table.incomeManualTransactionId} IS NOT NULL)`,
  ),
  // Kept in sync with TRANSFER_KINDS in lib/transfers/kinds.ts by a test in kinds.test.ts.
  // The literals are inlined rather than imported because drizzle-kit loads this file through
  // CJS and cannot resolve the ESM '.js' specifier the rest of the backend uses.
  kindValid: check('transfer_kind_valid', sql`${table.kind} IN ('account_transfer', 'credit_card_payment', 'refund', 'reimbursement')`),
  // Kept in sync with TRANSFER_SOURCES in lib/transfers/kinds.ts by a test in kinds.test.ts;
  // literals inlined for the same drizzle-kit CJS reason as transfer_kind_valid above.
  sourceValid: check('transfer_source_valid', sql`${table.source} IN ('manual', 'auto')`),
  // Partial uniques so no transaction can be pulled into two transfers from either side.
  // Reimbursements are excluded on the expense side because one expense can have multiple
  // reimbursement income links (partial reimbursements).
  expensePlaidUnique: uniqueIndex('transfers_expense_plaid_unique')
    .on(table.userId, table.expensePlaidTransactionId)
    .where(sql`${table.expensePlaidTransactionId} IS NOT NULL AND ${table.kind} != 'reimbursement'`),
  expenseManualUnique: uniqueIndex('transfers_expense_manual_unique')
    .on(table.userId, table.expenseManualTransactionId)
    .where(sql`${table.expenseManualTransactionId} IS NOT NULL AND ${table.kind} != 'reimbursement'`),
  incomePlaidUnique: uniqueIndex('transfers_income_plaid_unique')
    .on(table.userId, table.incomePlaidTransactionId)
    .where(sql`${table.incomePlaidTransactionId} IS NOT NULL`),
  incomeManualUnique: uniqueIndex('transfers_income_manual_unique')
    .on(table.userId, table.incomeManualTransactionId)
    .where(sql`${table.incomeManualTransactionId} IS NOT NULL`),
}))

// Remembers that the user unmarked a transfer on this expense leg, so auto-detection never
// re-creates the pair on the next scan (the scan is otherwise idempotent and would resurrect
// it every sync). Plaid ids only: auto-detection never touches manual transactions. Keyed on
// the expense (outflow) leg — the stable anchor; the income leg it pairs with may change.
// The full (non-partial) unique index is what lets creation be an ON CONFLICT-ignoring upsert.
export const transferDismissals = pgTable('transfer_dismissals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => authUsers.id),
  expensePlaidTransactionId: text('expense_plaid_transaction_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniquePerUser: uniqueIndex('transfer_dismissals_unique').on(table.userId, table.expensePlaidTransactionId),
}))
