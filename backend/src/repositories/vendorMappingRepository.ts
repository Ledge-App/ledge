import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface VendorMapping {
  id: string
  vendorName: string
  categoryId: string
  subcategoryId: string | null
  source: 'plaid_auto' | 'user_defined'
}

function fromRow(row: {
  id: string
  vendor_name: string
  category_id: string
  subcategory_id: string | null
  source: string
}): VendorMapping {
  return {
    id: row.id,
    vendorName: row.vendor_name,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    source: row.source as 'plaid_auto' | 'user_defined',
  }
}

export const vendorMappingRepository = {
  async list(jwt: string): Promise<VendorMapping[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('vendor_mappings').select('id, vendor_name, category_id, subcategory_id, source')
    if (error) throw error
    return data.map(fromRow)
  },

  async upsert(
    jwt: string,
    userId: string,
    input: { vendorName: string; categoryId: string; subcategoryId: string | null; source: 'plaid_auto' | 'user_defined' },
  ): Promise<VendorMapping> {
    const client = getScopedClient(jwt)
    const existing = await client
      .from('vendor_mappings')
      .select('id')
      .eq('user_id', userId)
      .eq('vendor_name', input.vendorName)
      .maybeSingle()

    const values = {
      user_id: userId,
      vendor_name: input.vendorName,
      category_id: input.categoryId,
      subcategory_id: input.subcategoryId,
      source: input.source,
    }

    const query = existing.data
      ? client.from('vendor_mappings').update(values).eq('id', existing.data.id)
      : client.from('vendor_mappings').insert(values)

    const { data, error } = await query.select('id, vendor_name, category_id, subcategory_id, source').single()
    if (error) throw error
    return fromRow(data)
  },

  // Bulk-write transaction_overrides for every given plaidTransactionId of this vendor (local cache IDs
  // supplied by the client, since Plaid transactions aren't persisted server-side — see architecture.md).
  async bulkRecategorize(
    jwt: string,
    userId: string,
    input: { vendorName: string; plaidTransactionIds: string[]; categoryId: string; subcategoryId: string | null },
  ): Promise<{ updatedCount: number }> {
    const client = getScopedClient(jwt)
    const rows = input.plaidTransactionIds.map((plaidTransactionId) => ({
      user_id: userId,
      plaid_transaction_id: plaidTransactionId,
      category_id: input.categoryId,
      subcategory_id: input.subcategoryId,
    }))
    const { error } = await client.from('transaction_overrides').upsert(rows, { onConflict: 'user_id,plaid_transaction_id' })
    if (error) throw error
    return { updatedCount: rows.length }
  },
}
