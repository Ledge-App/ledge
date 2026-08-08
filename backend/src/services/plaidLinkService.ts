import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'
import type { PlaidApi } from 'plaid'

async function requireCredentials(userId: string) {
  const creds = await plaidCredentialRepository.getDecrypted(userId)
  if (!creds) {
    throw new Error('No Plaid credentials saved for this user — connect a Plaid developer account first.')
  }
  return creds
}


async function removeItem(client: PlaidApi, userId: string, item: { itemId: string; accessToken: string }): Promise<void> {
  try {
    await client.itemRemove({ access_token: item.accessToken })
  } catch {
    // Already revoked at Plaid (or keys rotated) — the local row still has to go.
  }
  await plaidItemRepository.delete(userId, item.itemId)
}

export const plaidLinkService = {
  async createLinkToken(userId: string): Promise<{ linkToken: string }> {
    const creds = await requireCredentials(userId)
    const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)
    const response = await client.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Ledge',
      products: ['transactions'],
      // optional_products activates investments (holdings) where the institution supports
      // it WITHOUT narrowing the institution search the way listing it in `products` would.
      // Items linked before this consent exists return ADDITIONAL_CONSENT_REQUIRED on
      // holdings calls until relinked.
      optional_products: ['investments'],
      // How much history Plaid ingests for an item, decided once at link time — /transactions/sync
      // has no per-request date range, so without this the default 90 days is all an item will
      // ever have. 730 is Plaid's maximum. Applies to NEW links only: an existing item stays at
      // the depth it was linked with until the institution is relinked (which re-syncs in full).
      transactions: { days_requested: 730 },
      country_codes: ['US'],
      language: 'en',
    } as never)
    return { linkToken: response.data.link_token }
  },

  async exchangeToken(userId: string, publicToken: string): Promise<{ institutionId: string; institutionName: string }> {
    const creds = await requireCredentials(userId)
    const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)

    const exchange = await client.itemPublicTokenExchange({ public_token: publicToken } as never)
    const accessToken = exchange.data.access_token
    const itemId = exchange.data.item_id

    const itemResponse = await client.itemGet({ access_token: accessToken } as never)
    const institutionId = itemResponse.data.item.institution_id as string

    // include_optional_metadata carries the institution's logo (base64 PNG). Stored at link
    // time so account/transaction rows can badge the bank without a Plaid call per render;
    // Plaid has no logo for some institutions, recorded as '' (fetched-none) vs null (never
    // fetched) so the accounts.list lazy backfill knows not to retry.
    const institutionResponse = await client.institutionsGetById({
      institution_id: institutionId,
      country_codes: ['US'],
      options: { include_optional_metadata: true },
    } as never)
    const institutionName = institutionResponse.data.institution.name as string
    const institutionLogo = (institutionResponse.data.institution.logo as string | null) ?? ''

    // Relinking an institution is a CLEAN SLATE: the new connection replaces every
    // existing one for this institution. Accounts re-selected in Link carry on (their
    // history re-syncs in full under fresh ids, and transfer links re-detect
    // automatically); accounts NOT re-selected genuinely disappear and stop syncing.
    // This is also how a single account is disconnected: relink without it. No
    // duplicates are possible because only the newest connection survives.
    const existingItems = (await plaidItemRepository.listDecryptedTokens(userId)).filter(
      (item) => item.institutionId === institutionId,
    )
    for (const existing of existingItems) {
      await removeItem(client, userId, existing)
    }

    await plaidItemRepository.create({ userId, institutionId, institutionName, accessToken, itemId, institutionLogo })

    return { institutionId, institutionName }
  },
}
