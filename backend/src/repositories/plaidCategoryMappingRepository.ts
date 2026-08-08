import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface PlaidCategoryMapping {
  id: string
  plaidPfcPrimary: string
  plaidPfcDetailed: string | null
  categoryId: string
}

function fromRow(row: { id: string; plaid_pfc_primary: string; plaid_pfc_detailed: string | null; category_id: string }): PlaidCategoryMapping {
  return { id: row.id, plaidPfcPrimary: row.plaid_pfc_primary, plaidPfcDetailed: row.plaid_pfc_detailed, categoryId: row.category_id }
}

export const plaidCategoryMappingRepository = {
  async list(jwt: string): Promise<PlaidCategoryMapping[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('plaid_category_mappings').select('id, plaid_pfc_primary, plaid_pfc_detailed, category_id')
    if (error) throw error
    return data.map(fromRow)
  },

  async findById(jwt: string, id: string): Promise<PlaidCategoryMapping | null> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('plaid_category_mappings')
      .select('id, plaid_pfc_primary, plaid_pfc_detailed, category_id')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data ? fromRow(data) : null
  },

  async create(
    jwt: string,
    userId: string,
    input: { plaidPfcPrimary: string; plaidPfcDetailed: string | null; categoryId: string },
  ): Promise<PlaidCategoryMapping> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('plaid_category_mappings')
      .insert({
        user_id: userId,
        plaid_pfc_primary: input.plaidPfcPrimary,
        plaid_pfc_detailed: input.plaidPfcDetailed,
        category_id: input.categoryId,
      })
      .select('id, plaid_pfc_primary, plaid_pfc_detailed, category_id')
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async update(jwt: string, id: string, categoryId: string): Promise<PlaidCategoryMapping> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('plaid_category_mappings')
      .update({ category_id: categoryId })
      .eq('id', id)
      .select('id, plaid_pfc_primary, plaid_pfc_detailed, category_id')
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('plaid_category_mappings').delete().eq('id', id)
    if (error) throw error
  },
}
