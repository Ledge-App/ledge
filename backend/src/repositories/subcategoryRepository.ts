import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface Subcategory {
  id: string
  categoryId: string
  name: string
}

export const subcategoryRepository = {
  async findById(jwt: string, id: string): Promise<Subcategory | null> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('subcategories').select('id, category_id, name').eq('id', id).maybeSingle()
    if (error) throw error
    return data ? { id: data.id, categoryId: data.category_id, name: data.name } : null
  },

  async list(jwt: string, categoryId?: string): Promise<Subcategory[]> {
    const client = getScopedClient(jwt)
    let query = client.from('subcategories').select('id, category_id, name').order('name')
    if (categoryId) query = query.eq('category_id', categoryId)
    const { data, error } = await query
    if (error) throw error
    return data.map((row: { id: string; category_id: string; name: string }) => ({
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
    }))
  },

  async create(jwt: string, userId: string, input: { categoryId: string; name: string }): Promise<Subcategory> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('subcategories')
      .insert({ user_id: userId, category_id: input.categoryId, name: input.name })
      .select('id, category_id, name')
      .single()
    if (error) throw error
    return { id: data.id, categoryId: data.category_id, name: data.name }
  },

  async update(jwt: string, id: string, input: Partial<{ name: string }>): Promise<Subcategory> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('subcategories').update(input).eq('id', id).select('id, category_id, name').single()
    if (error) throw error
    return { id: data.id, categoryId: data.category_id, name: data.name }
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('subcategories').delete().eq('id', id)
    if (error) throw error
  },
}
