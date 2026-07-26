import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { plaidLinkService } from '../services/plaidLinkService.js'

export const plaidLinkRouter = router({
  createLinkToken: protectedProcedure.mutation(({ ctx }) => {
    return plaidLinkService.createLinkToken(ctx.userId)
  }),

  exchangeToken: protectedProcedure
    .input(z.object({ publicToken: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return plaidLinkService.exchangeToken(ctx.userId, input.publicToken)
    }),
})
