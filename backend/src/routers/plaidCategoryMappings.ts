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
