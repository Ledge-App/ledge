import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { plaidCredentialService } from '../services/plaidCredentialService.js'

const credentialInputSchema = z.object({
  clientId: z.string().min(1),
  secret: z.string().min(1),
  environment: z.enum(['sandbox', 'development', 'production']),
})

export const plaidCredentialsRouter = router({
  save: protectedProcedure.input(credentialInputSchema).mutation(({ ctx, input }) => {
    return plaidCredentialService.save(ctx.userId, input)
  }),

  test: protectedProcedure.input(credentialInputSchema).mutation(({ input }) => {
    return plaidCredentialService.test(input)
  }),

  get: protectedProcedure.query(({ ctx }) => {
    return plaidCredentialService.get(ctx.userId)
  }),
})
