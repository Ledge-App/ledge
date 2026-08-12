import { TRPCError } from '@trpc/server'
import { categoryRepository } from '../../repositories/categoryRepository.js'
import { subcategoryRepository } from '../../repositories/subcategoryRepository.js'
import { manualTransactionRepository } from '../../repositories/manualTransactionRepository.js'

/**
 * RLS hides other users' rows from the caller's scoped client, but foreign-key constraint
 * checks run as the system and see every row — so a write that references another user's
 * category, subcategory, or manual transaction passes both RLS's WITH CHECK (which only
 * inspects the new row's own user_id) and the FK. Beyond the dangling cross-tenant
 * reference itself, the differing FK error turns inserts into an existence oracle for
 * guessed UUIDs.
 *
 * Resolving each referenced id through the caller's own scope closes the gap: under RLS,
 * invisible and nonexistent are the same answer, so a foreign id and a made-up id are
 * indistinguishable to the caller.
 */
export async function assertOwnedRefs(
  jwt: string,
  refs: {
    categoryId?: string | null
    subcategoryId?: string | null
    manualTransactionIds?: Array<string | null | undefined>
  },
): Promise<void> {
  const checks: Array<Promise<void>> = []

  if (refs.categoryId != null) {
    checks.push(
      categoryRepository.findById(jwt, refs.categoryId).then((row) => {
        if (!row) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Category not found.' })
      }),
    )
  }

  if (refs.subcategoryId != null) {
    checks.push(
      subcategoryRepository.findById(jwt, refs.subcategoryId).then((row) => {
        if (!row) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Subcategory not found.' })
      }),
    )
  }

  for (const id of refs.manualTransactionIds ?? []) {
    if (id == null) continue
    checks.push(
      manualTransactionRepository.findById(jwt, id).then((row) => {
        if (!row) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Transaction not found.' })
      }),
    )
  }

  await Promise.all(checks)
}
