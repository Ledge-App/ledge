import { protectedProcedure, router } from '../trpc/trpc.js'
import { accountDeletionService } from '../services/accountDeletionService.js'

export const accountRouter = router({
  // No input: the account being deleted is always the caller's, taken from the verified JWT.
  // Accepting a user id here would make it possible to ask for someone else's.
  delete: protectedProcedure.mutation(({ ctx }) => {
    return accountDeletionService.deleteAccount(ctx.userId)
  }),
})
