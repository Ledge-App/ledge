import type { PlaidApi } from 'plaid'

export const accountRepository = {
  async get(client: PlaidApi, accessToken: string) {
    const response = await client.accountsGet({ access_token: accessToken })
    return response.data.accounts
  },
}
