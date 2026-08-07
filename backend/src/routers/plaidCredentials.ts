import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { plaidCredentialService } from '../services/plaidCredentialService.js'

const credentialInputSchema = z.object({
  clientId: z.string().min(1),
  secret: z.string().min(1),
  environment: z.enum(['sandbox', 'production']),
})

export const plaidCredentialsRouter = router({
  save: protectedProcedure.input(credentialInputSchema).mutation(({ ctx, input }) => {
    return plaidCredentialService.save(ctx.userId, ctx.email, input)
  }),

  test: protectedProcedure.input(credentialInputSchema).mutation(({ ctx, input }) => {
    return plaidCredentialService.test(ctx.userId, ctx.email, input)
  }),

  // Drives whether the client renders an environment choice at all. The server re-checks on
  // save, so this is a UI hint rather than the enforcement point.
  capabilities: protectedProcedure.query(async ({ ctx }) => {
    return { allowedEnvironments: await plaidCredentialService.allowedEnvironments(ctx.email) }
  }),

  get: protectedProcedure.query(({ ctx }) => {
    return plaidCredentialService.get(ctx.userId)
  }),
})
