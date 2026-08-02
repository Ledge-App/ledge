import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { transactionSyncService } from '../services/transactionSyncService.js'

export const transactionsRouter = router({
  sync: protectedProcedure
    .input(z.object({ cursors: z.record(z.string()) }))
    .mutation(({ ctx, input }) => {
      return transactionSyncService.sync(ctx.userId, input.cursors)
    }),
})
