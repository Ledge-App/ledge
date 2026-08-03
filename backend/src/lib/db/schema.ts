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
