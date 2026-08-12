import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { transactionOverrideRepository } from '../repositories/transactionOverrideRepository.js'
import { assertOwnedRefs } from '../lib/ownership/assertOwnedRefs.js'

export const transactionOverridesRouter = router({
  list: protectedProcedure.query(({ ctx }) => transactionOverrideRepository.list(ctx.jwt)),

  upsert: protectedProcedure
    .input(z.object({ plaidTransactionId: z.string().min(1), categoryId: z.string().uuid().nullable(), subcategoryId: z.string().uuid().nullable(), note: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedRefs(ctx.jwt, { categoryId: input.categoryId, subcategoryId: input.subcategoryId })
      return transactionOverrideRepository.upsert(ctx.jwt, ctx.userId, input)
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => transactionOverrideRepository.delete(ctx.jwt, input.id)),
})
