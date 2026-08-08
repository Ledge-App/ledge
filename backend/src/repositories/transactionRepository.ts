import type { PlaidApi, TransactionsSyncRequestOptions } from 'plaid'

/**
 * Pins the personal_finance_category taxonomy to v2 for every user.
 *
 * Without this, the version is whatever each user's own Plaid account defaults to — v1 for
 * accounts granted Transactions access before 2025-12-03, v2 after. Under BYOK that means two
 * users on the same build can receive different taxonomies, and DEFAULT_PFC_MAPPING is a single
 * hardcoded table. v2 is a superset of v1, so pinning up is the version that can be mapped
 * exhaustively.
 *
 * plaid@28 predates the field, so it isn't in TransactionsSyncRequestOptions yet (added later;
 * latest is 45.x). The API honours it regardless. The cast is scoped to this one object so the
 * rest of the request stays type-checked — it replaces an `as never` on the whole request, which
 * was silently disabling checking on access_token, cursor and count too. Drop it on SDK upgrade.
 */
const SYNC_OPTIONS = { personal_finance_category_version: 'v2' } as unknown as TransactionsSyncRequestOptions

export const transactionRepository = {
  async sync(client: PlaidApi, accessToken: string, cursor: string) {
    // count: 500 is Plaid's maximum page size — a freshly linked item's initial history
    // drains in 5x fewer pages than the default 100.
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor,
      count: 500,
      options: SYNC_OPTIONS,
    })
    return response.data
  },
}
