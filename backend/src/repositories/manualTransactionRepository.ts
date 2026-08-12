import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface ManualTransaction {
  id: string
  amount: string
  type: 'expense' | 'income'
  categoryId: string | null
  subcategoryId: string | null
  date: string
  note: string | null
}

function fromRow(row: {
  id: string
  amount: string
  type: string
  category_id: string | null
  subcategory_id: string | null
  date: string
  note: string | null
}): ManualTransaction {
  return {
    id: row.id,
    amount: row.amount,
    type: row.type as 'expense' | 'income',
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    date: row.date,
    note: row.note,
  }
}

const COLUMNS = 'id, amount, type, category_id, subcategory_id, date, note'

export const manualTransactionRepository = {
  async findById(jwt: string, id: string): Promise<ManualTransaction | null> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('manual_transactions').select(COLUMNS).eq('id', id).maybeSingle()
    if (error) throw error
    return data ? fromRow(data) : null
  },

  async list(jwt: string): Promise<ManualTransaction[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('manual_transactions').select(COLUMNS).order('date', { ascending: false })
    if (error) throw error
    return data.map(fromRow)
  },

  async create(
    jwt: string,
    userId: string,
    input: { amount: string; type: 'expense' | 'income'; categoryId: string | null; subcategoryId: string | null; date: string; note: string | null },
  ): Promise<ManualTransaction> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('manual_transactions')
      .insert({
        user_id: userId,
        amount: input.amount,
        type: input.type,
        category_id: input.categoryId,
        subcategory_id: input.subcategoryId,
        date: input.date,
        note: input.note,
      })
      .select(COLUMNS)
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async update(
    jwt: string,
    id: string,
    input: Partial<{ amount: string; type: 'expense' | 'income'; categoryId: string | null; subcategoryId: string | null; date: string; note: string | null }>,
  ): Promise<ManualTransaction> {
    const client = getScopedClient(jwt)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.amount !== undefined) patch.amount = input.amount
    if (input.type !== undefined) patch.type = input.type
    if (input.categoryId !== undefined) patch.category_id = input.categoryId
    if (input.subcategoryId !== undefined) patch.subcategory_id = input.subcategoryId
    if (input.date !== undefined) patch.date = input.date
    if (input.note !== undefined) patch.note = input.note

    const { data, error } = await client.from('manual_transactions').update(patch).eq('id', id).select(COLUMNS).single()
    if (error) throw error
    return fromRow(data)
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('manual_transactions').delete().eq('id', id)
    if (error) throw error
  },
}
