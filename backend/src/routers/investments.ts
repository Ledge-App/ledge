import { z } from 'zod'
import { protectedProcedure, router } from '../trpc/trpc.js'
import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'
import { investmentRepository } from '../repositories/investmentRepository.js'
import { investmentTransactionService } from '../services/investmentTransactionService.js'
import { notFoundError, preconditionError } from '../trpc/errors.js'

/** YYYY-MM-DD, the only date format Plaid's investments endpoints accept. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

export const investmentsRouter = router({
  // Holdings for one investment account. Fetched on demand when the account's detail sheet
  // opens (not with accounts.list): holdings calls are per-item and comparatively slow, and
  // most sessions never open an investment account.
  holdings: protectedProcedure
    .input(z.object({ itemId: z.string().min(1), accountId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const creds = await plaidCredentialRepository.getDecrypted(ctx.userId)
      if (!creds) throw preconditionError('No Plaid credentials saved for this user.')
      const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)

      const items = await plaidItemRepository.listDecryptedTokens(ctx.userId)
      const item = items.find((i) => i.itemId === input.itemId)
      if (!item) throw notFoundError('This account is not linked to your profile.')

      return investmentRepository.getHoldings(client, item.accessToken, input.accountId)
    }),

  // Item-wide, unlike holdings above: these rows feed transfer pairing across ALL accounts,
  // so the client needs every item's activity on every sync, not one account's on sheet open.
  transactions: protectedProcedure
    .input(z.object({ startDate: isoDate, endDate: isoDate }))
    .query(({ ctx, input }) => investmentTransactionService.fetch(ctx.userId, input.startDate, input.endDate)),
})
