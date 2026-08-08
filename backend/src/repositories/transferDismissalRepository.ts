import { getScopedClient } from '../lib/supabase/scopedClient.js'

// Remembers "this outflow is NOT a transfer" so auto-detection never re-creates a pair the
// user unmarked (the scan is idempotent and would otherwise resurrect it every sync).
// See docs/credit-card-payment-auto-transfer.md.

export interface TransferDismissal {
  id: string
  expensePlaidTransactionId: string
}

const COLUMNS = 'id, expense_plaid_transaction_id'

function fromRow(row: { id: string; expense_plaid_transaction_id: string }): TransferDismissal {
  return { id: row.id, expensePlaidTransactionId: row.expense_plaid_transaction_id }
}

export const transferDismissalRepository = {
  async list(jwt: string): Promise<TransferDismissal[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('transfer_dismissals').select(COLUMNS)
    if (error) throw error
    return data.map(fromRow)
  },

  /**
   * Idempotent: dismissing an already-dismissed leg is a no-op, not an error — unmarking
   * twice (double tap, two devices) must not surface a failure. The non-partial unique
   * index on (user_id, expense_plaid_transaction_id) is what makes the upsert expressible.
   */
  async create(jwt: string, userId: string, expensePlaidTransactionId: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client
      .from('transfer_dismissals')
      .upsert(
        { user_id: userId, expense_plaid_transaction_id: expensePlaidTransactionId },
        { onConflict: 'user_id,expense_plaid_transaction_id', ignoreDuplicates: true },
      )
    if (error) throw error
  },
}
