import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { accountOrderRepository } from '../repositories/accountOrderRepository.js'

export const accountOrdersRouter = router({
  list: protectedProcedure.query(({ ctx }) => accountOrderRepository.list(ctx.jwt)),

  // Takes one group's full order. The client already holds the reordered list, and sending
  // it whole is what keeps the stored positions internally consistent — see setOrder.
  setOrder: protectedProcedure
    .input(z.object({ accountIds: z.array(z.string().min(1)).max(200) }))
    .mutation(({ ctx, input }) => accountOrderRepository.setOrder(ctx.jwt, ctx.userId, input.accountIds)),
})
