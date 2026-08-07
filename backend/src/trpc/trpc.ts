import { initTRPC, TRPCError } from '@trpc/server'
import type { Context } from './context.js'

const t = initTRPC.context<Context>().create()

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId || !ctx.jwt) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  // email stays nullable past this point: authentication does not guarantee an email claim.
  return next({ ctx: { userId: ctx.userId, email: ctx.email ?? null, jwt: ctx.jwt } })
})
