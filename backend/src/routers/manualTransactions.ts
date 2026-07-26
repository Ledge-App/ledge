import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { manualTransactionRepository } from '../repositories/manualTransactionRepository.js'

const amountSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a positive decimal')

export const manualTransactionsRouter = router({
  list: protectedProcedure.query(({ ctx }) => manualTransactionRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(
      z.object({
        amount: amountSchema,
        type: z.enum(['expense', 'income']),
        categoryId: z.string().uuid().nullable(),
        subcategoryId: z.string().uuid().nullable(),
        date: z.string(),
        note: z.string().nullable(),
      }),
    )
    .mutation(({ ctx, input }) => manualTransactionRepository.create(ctx.jwt, ctx.userId, input)),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        amount: amountSchema.optional(),
        type: z.enum(['expense', 'income']).optional(),
        categoryId: z.string().uuid().nullable().optional(),
        subcategoryId: z.string().uuid().nullable().optional(),
        date: z.string().optional(),
        note: z.string().nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input
      return manualTransactionRepository.update(ctx.jwt, id, patch)
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => manualTransactionRepository.delete(ctx.jwt, input.id)),
})
