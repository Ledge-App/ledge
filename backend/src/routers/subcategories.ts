import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { subcategoryRepository } from '../repositories/subcategoryRepository.js'

export const subcategoriesRouter = router({
  list: protectedProcedure
    .input(z.object({ categoryId: z.string().uuid().optional() }))
    .query(({ ctx, input }) => subcategoryRepository.list(ctx.jwt, input.categoryId)),

  create: protectedProcedure
    .input(z.object({ categoryId: z.string().uuid(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) => subcategoryRepository.create(ctx.jwt, ctx.userId, input)),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), name: z.string().min(1) }))
    .mutation(({ ctx, input }) => subcategoryRepository.update(ctx.jwt, input.id, { name: input.name })),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => subcategoryRepository.delete(ctx.jwt, input.id)),
})
