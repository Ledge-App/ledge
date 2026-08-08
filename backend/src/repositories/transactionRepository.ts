import type { PlaidApi } from 'plaid'

export const transactionRepository = {
  async sync(client: PlaidApi, accessToken: string, cursor: string) {
    // count: 500 is Plaid's maximum page size — a freshly linked item's initial history
    // drains in 5x fewer pages than the default 100.
    const response = await client.transactionsSync({ access_token: accessToken, cursor, count: 500 } as never)
    return response.data
  },
}
