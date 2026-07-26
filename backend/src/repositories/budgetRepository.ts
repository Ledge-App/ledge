import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface Budget {
  id: string
  categoryId: string
  amount: string
  period: 'monthly' | 'weekly' | 'yearly'
}

function fromRow(row: { id: string; category_id: string; amount: string; period: string }): Budget {
  return { id: row.id, categoryId: row.category_id, amount: row.amount, period: row.period as Budget['period'] }
}

export const budgetRepository = {
  async list(jwt: string): Promise<Budget[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('budgets').select('id, category_id, amount, period')
    if (error) throw error
    return data.map(fromRow)
  },

  async create(jwt: string, userId: string, input: { categoryId: string; amount: string; period: Budget['period'] }): Promise<Budget> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('budgets')
      .insert({ user_id: userId, category_id: input.categoryId, amount: input.amount, period: input.period })
      .select('id, category_id, amount, period')
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async update(jwt: string, id: string, input: Partial<{ amount: string; period: Budget['period'] }>): Promise<Budget> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('budgets').update(input).eq('id', id).select('id, category_id, amount, period').single()
    if (error) throw error
    return fromRow(data)
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('budgets').delete().eq('id', id)
    if (error) throw error
  },
}
