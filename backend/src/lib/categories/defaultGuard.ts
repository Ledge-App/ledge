import { TRPCError } from '@trpc/server'
import { categoryRepository } from '../../repositories/categoryRepository.js'

/**
 * Categories seeded from DEFAULT_PFC_MAPPING are fixed: name, colour, icon, Plaid code mappings,
 * and existence itself. Users express their own preferences by creating categories alongside them.
 *
 * Enforced here rather than only in the app because the seeded set is what migrations and the
 * Plaid fallback identify categories by; a mutable default makes both unreliable.
 */
export async function assertCategoryIsNotDefault(jwt: string, categoryId: string, action: string): Promise<void> {
  const category = await categoryRepository.findById(jwt, categoryId)
  // A missing row is not this guard's business — the underlying write reports it.
  if (category?.isDefault) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Built-in categories cannot be ${action}.` })
  }
}
