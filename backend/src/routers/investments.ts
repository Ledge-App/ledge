import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'
import { investmentRepository } from '../repositories/investmentRepository.js'

export const investmentsRouter = router({
  // Holdings for one investment account. Fetched on demand when the account's detail sheet
  // opens (not with accounts.list): holdings calls are per-item and comparatively slow, and
  // most sessions never open an investment account.
  holdings: protectedProcedure
    .input(z.object({ itemId: z.string().min(1), accountId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const creds = await plaidCredentialRepository.getDecrypted(ctx.userId)
      if (!creds) throw new Error('No Plaid credentials saved for this user.')
      const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)

      const items = await plaidItemRepository.listDecryptedTokens(ctx.userId)
      const item = items.find((i) => i.itemId === input.itemId)
      if (!item) throw new Error('This account is not linked to your profile.')

      return investmentRepository.getHoldings(client, item.accessToken, input.accountId)
    }),
})
