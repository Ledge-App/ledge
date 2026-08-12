import { eq } from 'drizzle-orm'
import { db } from '../lib/db/client.js'
import {
  budgets,
  categories,
  manualTransactions,
  plaidCategoryMappings,
  plaidCredentials,
  plaidItems,
  subcategories,
  transactionOverrides,
  transferDismissals,
  transfers,
  vendorMappings,
} from '../lib/db/schema.js'

/**
 * Every user-scoped table, ordered so each delete runs before the tables it depends on.
 *
 * None of the `user_id` foreign keys declare ON DELETE CASCADE, and neither do the
 * category/subcategory references between these tables, so Postgres will refuse a delete that
 * leaves a referencing row behind. The order is therefore load-bearing, not cosmetic:
 * everything that points at `categories`/`subcategories` has to go first, and those two before
 * the auth user itself.
 *
 * `transfers` also cascades from `manual_transactions`, but it is deleted explicitly first —
 * a transfer whose legs are both Plaid transactions has no cascade path at all.
 */
const DELETION_ORDER = [
  transfers,
  transferDismissals,
  budgets,
  transactionOverrides,
  manualTransactions,
  vendorMappings,
  plaidCategoryMappings,
  subcategories,
  categories,
  plaidItems,
  plaidCredentials,
] as const

export const accountDeletionRepository = {
  /**
   * Erases every row this user owns, in one transaction.
   *
   * All-or-nothing matters here beyond the usual tidiness: a partial delete would leave an
   * account that still authenticates but whose categories are gone, which renders as a broken
   * app rather than a deleted one.
   */
  async deleteAllUserData(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      for (const table of DELETION_ORDER) {
        await tx.delete(table).where(eq(table.userId, userId))
      }
    })
  },
}
