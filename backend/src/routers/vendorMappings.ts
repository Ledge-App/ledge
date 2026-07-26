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
