import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { reimbursementRepository } from '../repositories/reimbursementRepository.js'
import { reimbursementService } from '../services/reimbursementService.js'

const reimbursementInputSchema = z.object({
  expensePlaidTransactionId: z.string().nullable(),
  expenseManualTransactionId: z.string().uuid().nullable(),
  incomePlaidTransactionId: z.string().nullable(),
  incomeManualTransactionId: z.string().uuid().nullable(),
  amount: z.string(),
  note: z.string().nullable(),
})

export const reimbursementsRouter = router({
  list: protectedProcedure.query(({ ctx }) => reimbursementRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(reimbursementInputSchema)
    .mutation(({ ctx, input }) => reimbursementRepository.create(ctx.jwt, ctx.userId, input)),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => reimbursementRepository.delete(ctx.jwt, input.id)),

  netExpense: protectedProcedure
    .input(z.object({ originalAmount: z.string(), linkedAmounts: z.array(z.string()) }))
    .query(({ input }) =>
      reimbursementService.calculateNetExpense(input.originalAmount, input.linkedAmounts.map((amount) => ({ amount }))),
    ),
})
