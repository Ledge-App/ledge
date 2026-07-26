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
