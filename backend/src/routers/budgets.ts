import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { budgetRepository } from '../repositories/budgetRepository.js'
import { budgetService } from '../services/budgetService.js'
import { assertOwnedRefs } from '../lib/ownership/assertOwnedRefs.js'

export const budgetsRouter = router({
  list: protectedProcedure.query(({ ctx }) => budgetRepository.list(ctx.jwt)),

  // The v2 write path: one upsert per (category, month). amount null = stop budgeting from
  // that month on (tombstone); alertThreshold null = alerts off.
  set: protectedProcedure
    .input(
      z.object({
        categoryId: z.string().uuid(),
        effectiveMonth: z.string().regex(/^\d{4}-\d{2}-01$/),
        amount: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable(),
        alertThreshold: z.number().int().min(1).max(100).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedRefs(ctx.jwt, { categoryId: input.categoryId })
      return budgetRepository.set(ctx.jwt, ctx.userId, input)
    }),

  create: protectedProcedure
    .input(z.object({ categoryId: z.string().uuid(), amount: z.string(), period: z.enum(['monthly', 'weekly', 'yearly']) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedRefs(ctx.jwt, { categoryId: input.categoryId })
      return budgetRepository.create(ctx.jwt, ctx.userId, input)
    }),

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
      // Tombstones (amount null) mark "stopped budgeting" boundaries — nothing to calculate.
      return budgets
        .filter((budget): budget is typeof budget & { amount: string } => budget.amount !== null)
        .map((budget) => ({
          ...budget,
          ...budgetService.calculateProgress(budget, input.spendByCategory[budget.categoryId] ?? '0.00'),
        }))
    }),
})
