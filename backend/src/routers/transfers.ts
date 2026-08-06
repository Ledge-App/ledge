import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { transferRepository } from '../repositories/transferRepository.js'
import { TRANSFER_KINDS } from '../lib/transfers/kinds.js'

const transferInputSchema = z.object({
  kind: z.enum(TRANSFER_KINDS),
  expensePlaidTransactionId: z.string().nullable(),
  expenseManualTransactionId: z.string().uuid().nullable(),
  // Both nullable: an unpaired transfer has no income leg.
  incomePlaidTransactionId: z.string().nullable(),
  incomeManualTransactionId: z.string().uuid().nullable(),
  amount: z.string(),
  note: z.string().nullable(),
})

export const transfersRouter = router({
  list: protectedProcedure.query(({ ctx }) => transferRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(transferInputSchema)
    .mutation(({ ctx, input }) => transferRepository.create(ctx.jwt, ctx.userId, input)),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => transferRepository.delete(ctx.jwt, input.id)),
})
