import type { PlaidApi } from 'plaid'

export const transactionRepository = {
  async sync(client: PlaidApi, accessToken: string, cursor: string) {
    const response = await client.transactionsSync({ access_token: accessToken, cursor } as never)
    return response.data
  },
}
