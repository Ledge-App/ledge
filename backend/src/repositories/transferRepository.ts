import { getScopedClient } from '../lib/supabase/scopedClient.js'
import type { TransferKind } from '../lib/transfers/kinds.js'

export interface Transfer {
  id: string
  kind: TransferKind
  expensePlaidTransactionId: string | null
  expenseManualTransactionId: string | null
  incomePlaidTransactionId: string | null
  incomeManualTransactionId: string | null
  amount: string
  note: string | null
}

export interface TransferInput {
  kind: TransferKind
  expensePlaidTransactionId: string | null
  expenseManualTransactionId: string | null
  incomePlaidTransactionId: string | null
  incomeManualTransactionId: string | null
  amount: string
  note: string | null
}

const COLUMNS =
  'id, kind, expense_plaid_transaction_id, expense_manual_transaction_id, income_plaid_transaction_id, income_manual_transaction_id, amount, note'

function exactlyOne(a: unknown, b: unknown): boolean {
  return (a !== null) !== (b !== null)
}

function atMostOne(a: unknown, b: unknown): boolean {
  return !(a !== null && b !== null)
}

function fromRow(row: {
  id: string
  kind: string
  expense_plaid_transaction_id: string | null
  expense_manual_transaction_id: string | null
  income_plaid_transaction_id: string | null
  income_manual_transaction_id: string | null
  amount: string
  note: string | null
}): Transfer {
  return {
    id: row.id,
    kind: row.kind as TransferKind,
    expensePlaidTransactionId: row.expense_plaid_transaction_id,
    expenseManualTransactionId: row.expense_manual_transaction_id,
    incomePlaidTransactionId: row.income_plaid_transaction_id,
    incomeManualTransactionId: row.income_manual_transaction_id,
    amount: row.amount,
    note: row.note,
  }
}

export const transferRepository = {
  async list(jwt: string): Promise<Transfer[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('transfers').select(COLUMNS)
    if (error) throw error
    return data.map(fromRow)
  },

  async create(jwt: string, userId: string, input: TransferInput): Promise<Transfer> {
    if (!exactlyOne(input.expensePlaidTransactionId, input.expenseManualTransactionId)) {
      throw new Error('Exactly one of expensePlaidTransactionId/expenseManualTransactionId must be set')
    }
    // Unlike a reimbursement, a transfer may have no income leg at all — the destination
    // account isn't necessarily connected to the app.
    if (!atMostOne(input.incomePlaidTransactionId, input.incomeManualTransactionId)) {
      throw new Error('At most one of incomePlaidTransactionId/incomeManualTransactionId may be set')
    }

    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('transfers')
      .insert({
        user_id: userId,
        kind: input.kind,
        expense_plaid_transaction_id: input.expensePlaidTransactionId,
        expense_manual_transaction_id: input.expenseManualTransactionId,
        income_plaid_transaction_id: input.incomePlaidTransactionId,
        income_manual_transaction_id: input.incomeManualTransactionId,
        amount: input.amount,
        note: input.note,
      })
      .select(COLUMNS)
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('transfers').delete().eq('id', id)
    if (error) throw error
  },
}
