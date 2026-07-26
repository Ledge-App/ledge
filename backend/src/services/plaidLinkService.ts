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

    const institutionResponse = await client.institutionsGetById({
      institution_id: institutionId,
      country_codes: ['US'],
    } as never)
    const institutionName = institutionResponse.data.institution.name as string

    await plaidItemRepository.create({ userId, institutionId, institutionName, accessToken, itemId })

    return { institutionId, institutionName }
  },
}
