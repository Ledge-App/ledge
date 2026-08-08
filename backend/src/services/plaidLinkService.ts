import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'

async function requireCredentials(userId: string) {
  const creds = await plaidCredentialRepository.getDecrypted(userId)
  if (!creds) {
    throw new Error('No Plaid credentials saved for this user — connect a Plaid developer account first.')
  }
  return creds
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

    await plaidItemRepository.create({ userId, institutionId, institutionName, accessToken, itemId, institutionLogo })

    return { institutionId, institutionName }
  },
}
