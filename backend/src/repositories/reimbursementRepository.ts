import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface Reimbursement {
  id: string
  expensePlaidTransactionId: string | null
  expenseManualTransactionId: string | null
  incomePlaidTransactionId: string | null
  incomeManualTransactionId: string | null
  amount: string
  note: string | null
}

export interface ReimbursementInput {
  expensePlaidTransactionId: string | null
  expenseManualTransactionId: string | null
  incomePlaidTransactionId: string | null
  incomeManualTransactionId: string | null
  amount: string
  note: string | null
}

function exactlyOne(a: unknown, b: unknown): boolean {
  return (a !== null) !== (b !== null)
}

function fromRow(row: {
  id: string
  expense_plaid_transaction_id: string | null
  expense_manual_transaction_id: string | null
  income_plaid_transaction_id: string | null
  income_manual_transaction_id: string | null
  amount: string
  note: string | null
}): Reimbursement {
  return {
    id: row.id,
    expensePlaidTransactionId: row.expense_plaid_transaction_id,
    expenseManualTransactionId: row.expense_manual_transaction_id,
    incomePlaidTransactionId: row.income_plaid_transaction_id,
    incomeManualTransactionId: row.income_manual_transaction_id,
    amount: row.amount,
    note: row.note,
  }
}

export const reimbursementRepository = {
  async list(jwt: string): Promise<Reimbursement[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('reimbursements')
      .select('id, expense_plaid_transaction_id, expense_manual_transaction_id, income_plaid_transaction_id, income_manual_transaction_id, amount, note')
    if (error) throw error
    return data.map(fromRow)
  },

  async create(jwt: string, userId: string, input: ReimbursementInput): Promise<Reimbursement> {
    if (!exactlyOne(input.expensePlaidTransactionId, input.expenseManualTransactionId)) {
      throw new Error('Exactly one of expensePlaidTransactionId/expenseManualTransactionId must be set')
    }
    if (!exactlyOne(input.incomePlaidTransactionId, input.incomeManualTransactionId)) {
      throw new Error('Exactly one of incomePlaidTransactionId/incomeManualTransactionId must be set')
    }

    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('reimbursements')
      .insert({
        user_id: userId,
        expense_plaid_transaction_id: input.expensePlaidTransactionId,
        expense_manual_transaction_id: input.expenseManualTransactionId,
        income_plaid_transaction_id: input.incomePlaidTransactionId,
        income_manual_transaction_id: input.incomeManualTransactionId,
        amount: input.amount,
        note: input.note,
      })
      .select('id, expense_plaid_transaction_id, expense_manual_transaction_id, income_plaid_transaction_id, income_manual_transaction_id, amount, note')
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('reimbursements').delete().eq('id', id)
    if (error) throw error
  },
}
