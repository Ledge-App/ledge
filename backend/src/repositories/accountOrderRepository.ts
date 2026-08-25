import { getScopedClient } from '../lib/supabase/scopedClient.js'

// The user's chosen display order for their accounts. Positions are per-group, but the group
// itself is never stored — it's derived from Plaid's account type at render time, so a row
// here is just "this account sits at index N among its peers".

export interface AccountOrder {
  accountId: string
  position: number
}

const COLUMNS = 'account_id, position'

function fromRow(row: { account_id: string; position: number }): AccountOrder {
  return { accountId: row.account_id, position: row.position }
}

export const accountOrderRepository = {
  async list(jwt: string): Promise<AccountOrder[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('account_orders').select(COLUMNS)
    if (error) throw error
    return data.map(fromRow)
  },

  /**
   * Replaces the positions for exactly the accounts named, in the order given.
   *
   * Whole-list rather than per-row: moving one account changes the index of every account
   * it passed, so a single-position update API would need the client to compute and send
   * the same set of writes anyway — with a window where the list is half-reordered.
   *
   * Scoped to the ids passed, never a delete-all: the caller sends one GROUP, and wiping
   * rows outside it would drop the order of the two groups the user didn't touch.
   *
   * Upsert rather than delete-then-insert: the unique index on (user_id, account_id) makes
   * it expressible in one round trip, and it can't leave the user order-less if the second
   * statement fails.
   */
  async setOrder(jwt: string, userId: string, accountIds: string[]): Promise<void> {
    if (accountIds.length === 0) return
    const client = getScopedClient(jwt)
    const { error } = await client.from('account_orders').upsert(
      accountIds.map((accountId, position) => ({ user_id: userId, account_id: accountId, position })),
      { onConflict: 'user_id,account_id' },
    )
    if (error) throw error
  },
}
