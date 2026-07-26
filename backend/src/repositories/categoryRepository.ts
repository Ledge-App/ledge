import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface Category {
  id: string
  name: string
  color: string
  icon: string
}

export const categoryRepository = {
  async list(jwt: string): Promise<Category[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('categories').select('id, name, color, icon').order('name')
    if (error) throw error
    return data
  },

  async create(jwt: string, userId: string, input: { name: string; color: string; icon: string }): Promise<Category> {
    const client = getScopedClient(jwt)
    const { data, error } = await client
      .from('categories')
      .insert({ user_id: userId, ...input })
      .select('id, name, color, icon')
      .single()
    if (error) throw error
    return data
  },

  async update(jwt: string, id: string, input: Partial<{ name: string; color: string; icon: string }>): Promise<Category> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('categories').update(input).eq('id', id).select('id, name, color, icon').single()
    if (error) throw error
    return data
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('categories').delete().eq('id', id)
    if (error) throw error
  },
}
