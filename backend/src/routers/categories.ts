import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { assertCategoryIsNotDefault } from '../lib/categories/defaultGuard.js'
import { categoryRepository } from '../repositories/categoryRepository.js'

export const categoriesRouter = router({
  list: protectedProcedure.query(({ ctx }) => categoryRepository.list(ctx.jwt)),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), color: z.string().min(1), icon: z.string().min(1) }))
    // isDefault is intentionally not accepted from the client: only seeding creates defaults.
    .mutation(({ ctx, input }) => categoryRepository.create(ctx.jwt, ctx.userId, input)),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1).optional(), color: z.string().min(1).optional(), icon: z.string().min(1).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input
      await assertCategoryIsNotDefault(ctx.jwt, id, 'edited')
      return categoryRepository.update(ctx.jwt, id, patch)
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertCategoryIsNotDefault(ctx.jwt, input.id, 'deleted')
      return categoryRepository.delete(ctx.jwt, input.id)
    }),
})
