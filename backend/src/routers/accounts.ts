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

    const accounts = []
    const itemErrors = []
    for (const item of items) {
      // Lazy logo backfill for items linked before institution logos were stored. NULL means
      // never fetched; one fetch resolves it to the logo or '' (institution has none), so
      // logo-less banks are never re-queried. Best-effort: a failure just leaves it NULL for
      // the next list to retry.
      let institutionLogo = item.institutionLogo
      if (institutionLogo === null) {
        try {
          const res = await client.institutionsGetById({
            institution_id: item.institutionId,
            country_codes: ['US'],
            options: { include_optional_metadata: true },
          } as never)
          institutionLogo = ((res.data.institution.logo as string | null) ?? '')
          await plaidItemRepository.updateLogo(ctx.userId, item.itemId, institutionLogo)
        } catch {
          institutionLogo = ''
        }
      }

      // One broken item (revoked access, ITEM_LOGIN_REQUIRED, keys that no longer match the
      // token) must not take down the whole query — this is the root of the transaction feed,
      // so throwing here blanks the dashboard, transactions and net worth at once. Mirrors the
      // per-item isolation transactionSyncService already applies.
      try {
        for (const account of await accountRepository.get(client, item.accessToken)) {
          accounts.push({
            ...account,
            itemId: item.itemId,
            institutionName: item.institutionName,
            institutionLogo: institutionLogo === '' ? null : institutionLogo,
          })
        }
      } catch (err) {
        itemErrors.push({
          itemId: item.itemId,
          institutionName: item.institutionName,
          message: err instanceof Error ? err.message : 'Could not load accounts for this institution.',
        })
      }
    }
    return { accounts, itemErrors }
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
