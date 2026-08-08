import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { transferDismissalRepository } from '../repositories/transferDismissalRepository.js'

export const transferDismissalsRouter = router({
  list: protectedProcedure.query(({ ctx }) => transferDismissalRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(z.object({ expensePlaidTransactionId: z.string().min(1) }))
    .mutation(({ ctx, input }) =>
      transferDismissalRepository.create(ctx.jwt, ctx.userId, input.expensePlaidTransactionId),
    ),
})
