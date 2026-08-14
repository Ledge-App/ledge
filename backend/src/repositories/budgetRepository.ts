import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface Budget {
  id: string
  categoryId: string
  /** Monthly dollars; null marks a tombstone ("stopped budgeting this from effectiveMonth on"). */
  amount: string | null
  period: 'monthly' | 'weekly' | 'yearly'
  /** First day of the month this row takes effect (YYYY-MM-DD). */
  effectiveMonth: string
  /** Notify at this percent of the budget (1-100); null = alerts off. */
  alertThreshold: number | null
}

function fromRow(row: {
  id: string
  category_id: string
  amount: string | null
  period: string
  effective_month: string
  alert_threshold: number | null
}): Budget {
  return {
    id: row.id,
    categoryId: row.category_id,
    amount: row.amount,
    period: row.period as Budget['period'],
    effectiveMonth: row.effective_month,
    alertThreshold: row.alert_threshold,
  }
}

const COLUMNS = 'id, category_id, amount, period, effective_month, alert_threshold'

export const budgetRepository = {
  async list(jwt: string): Promise<Budget[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('budgets').select(COLUMNS)
    if (error) throw error
    return data.map(fromRow)
  },

  /**
   * The one write path the new client uses: upsert this category's row for the given month.
   * Editing a budget mid-month replaces the same month's row (no history spam within a month);
   * a change in a later month inserts a fresh row and leaves history intact.
   */
  async set(
    jwt: string,
    userId: string,
    input: { categoryId: string; effectiveMonth: string; amount: string | null; alertThreshold: number | null },
  ): Promise<Budget> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('budgets')
      .upsert(
        {
          user_id: userId,
          category_id: input.categoryId,
          effective_month: input.effectiveMonth,
          amount: input.amount,
          alert_threshold: input.alertThreshold,
          period: 'monthly',
        },
        { onConflict: 'user_id,category_id,effective_month' },
      )
      .select(COLUMNS)
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async create(jwt: string, userId: string, input: { categoryId: string; amount: string; period: Budget['period'] }): Promise<Budget> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('budgets')
      .insert({ user_id: userId, category_id: input.categoryId, amount: input.amount, period: input.period })
      .select(COLUMNS)
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async update(jwt: string, id: string, input: Partial<{ amount: string; period: Budget['period'] }>): Promise<Budget> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('budgets').update(input).eq('id', id).select(COLUMNS).single()
    if (error) throw error
    return fromRow(data)
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('budgets').delete().eq('id', id)
    if (error) throw error
  },
}
