import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { budgetRepository } from '../repositories/budgetRepository.js'
import { budgetService } from '../services/budgetService.js'

export const budgetsRouter = router({
  list: protectedProcedure.query(({ ctx }) => budgetRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(z.object({ categoryId: z.string(), amount: z.string(), period: z.enum(['monthly', 'weekly', 'yearly']) }))
    .mutation(({ ctx, input }) => budgetRepository.create(ctx.jwt, ctx.userId, input)),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), amount: z.string().optional(), period: z.enum(['monthly', 'weekly', 'yearly']).optional() }))
    .mutation(({ ctx, input }) => {
      const { id, ...patch } = input
      return budgetRepository.update(ctx.jwt, id, patch)
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => budgetRepository.delete(ctx.jwt, input.id)),

  // spendByCategory is computed client-side from the on-device transaction cache (never persisted
  // server-side — see architecture.md) and passed in so this stays a pure calculation over live data.
  spendCalculations: protectedProcedure
    .input(z.object({ spendByCategory: z.record(z.string()) }))
    .query(async ({ ctx, input }) => {
      const budgets = await budgetRepository.list(ctx.jwt)
      return budgets.map((budget) => ({
        ...budget,
        ...budgetService.calculateProgress(budget, input.spendByCategory[budget.categoryId] ?? '0.00'),
      }))
    }),
})
