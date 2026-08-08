import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { assertCategoryIsNotDefault } from '../lib/categories/defaultGuard.js'
import { plaidCategoryMappingRepository } from '../repositories/plaidCategoryMappingRepository.js'

/** Resolves the category a mapping currently belongs to, so a guard can be applied to it. */
async function categoryIdOfMapping(jwt: string, mappingId: string): Promise<string> {
  const mapping = await plaidCategoryMappingRepository.findById(jwt, mappingId)
  if (!mapping) throw new TRPCError({ code: 'NOT_FOUND', message: 'Mapping not found.' })
  return mapping.categoryId
}

export const plaidCategoryMappingsRouter = router({
  list: protectedProcedure.query(({ ctx }) => plaidCategoryMappingRepository.list(ctx.jwt)),

  // Seeding writes a default's mappings through the repository directly, so these router-level
  // guards lock the set for users without blocking onboarding.
  create: protectedProcedure
    .input(z.object({ plaidPfcPrimary: z.string().min(1), plaidPfcDetailed: z.string().nullable(), categoryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertCategoryIsNotDefault(ctx.jwt, input.categoryId, 'edited')
      return plaidCategoryMappingRepository.create(ctx.jwt, ctx.userId, input)
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), categoryId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Both ends matter: moving a code off a default strips it, moving one onto a default adds to
      // its fixed set.
      await assertCategoryIsNotDefault(ctx.jwt, await categoryIdOfMapping(ctx.jwt, input.id), 'edited')
      await assertCategoryIsNotDefault(ctx.jwt, input.categoryId, 'edited')
      return plaidCategoryMappingRepository.update(ctx.jwt, input.id, input.categoryId)
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertCategoryIsNotDefault(ctx.jwt, await categoryIdOfMapping(ctx.jwt, input.id), 'edited')
      return plaidCategoryMappingRepository.delete(ctx.jwt, input.id)
    }),
})
