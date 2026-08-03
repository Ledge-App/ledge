import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'
import { accountRepository } from '../repositories/accountRepository.js'

export const accountsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const creds = await plaidCredentialRepository.getDecrypted(ctx.userId)
    if (!creds) throw new Error('No Plaid credentials saved for this user.')
    const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)
    const items = await plaidItemRepository.listDecryptedTokens(ctx.userId)

    const results = []
    for (const item of items) {
      const accounts = await accountRepository.get(client, item.accessToken)
      for (const account of accounts) {
        results.push({ ...account, itemId: item.itemId, institutionName: item.institutionName })
      }
    }
    return results
  }),

  listInstitutions: protectedProcedure.query(async ({ ctx }) => {
    return plaidItemRepository.list(ctx.userId)
  }),

  removeInstitution: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const creds = await plaidCredentialRepository.getDecrypted(ctx.userId)
      if (creds) {
        const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)
        const items = await plaidItemRepository.listDecryptedTokens(ctx.userId)
        const item = items.find((i) => i.itemId === input.itemId)
        if (item) {
          try {
            await client.itemRemove({ access_token: item.accessToken })
          } catch {
            // If Plaid rejects (e.g. already removed), still delete locally
          }
        }
      }
      await plaidItemRepository.delete(ctx.userId, input.itemId)
    }),
})
