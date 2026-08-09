import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { plaidLinkService } from '../services/plaidLinkService.js'

export const plaidLinkRouter = router({
  createLinkToken: protectedProcedure.mutation(({ ctx }) => {
    return plaidLinkService.createLinkToken(ctx.userId)
  }),

  // Update mode: re-auth, account selection, and history deepening for an item that already
  // exists. Note there is no matching "exchange" — a session opened with this token leaves the
  // stored access token valid, so exchanging anything afterwards would create the very Item this
  // exists to avoid.
  createUpdateToken: protectedProcedure
    .input(z.object({ itemId: z.string().min(1), accountSelection: z.boolean().optional() }))
    .mutation(({ ctx, input }) => {
      return plaidLinkService.createUpdateLinkToken(ctx.userId, input.itemId, {
        accountSelection: input.accountSelection,
      })
    }),

  exchangeToken: protectedProcedure
    .input(z.object({ publicToken: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return plaidLinkService.exchangeToken(ctx.userId, input.publicToken)
    }),
})
