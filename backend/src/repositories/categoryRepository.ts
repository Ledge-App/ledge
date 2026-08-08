import { getScopedClient } from '../lib/supabase/scopedClient.js'

export interface Category {
  id: string
  name: string
  color: string
  icon: string
  /** True for the rows onboarding seeds from DEFAULT_PFC_MAPPING. Their names are not editable. */
  isDefault: boolean
}

// PostgREST returns raw column names, so is_default is aliased here rather than remapped at every
// call site.
const COLUMNS = 'id, name, color, icon, isDefault:is_default'

export const categoryRepository = {
  async list(jwt: string): Promise<Category[]> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('categories').select(COLUMNS).order('name')
    if (error) throw error
    return data
  },

  async findById(jwt: string, id: string): Promise<Category | null> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('categories').select(COLUMNS).eq('id', id).maybeSingle()
    if (error) throw error
    return data
  },

  async create(
    jwt: string,
    userId: string,
    input: { name: string; color: string; icon: string; isDefault?: boolean },
  ): Promise<Category> {
    const client = getScopedClient(jwt)
    const { isDefault, ...rest } = input
    const { data, error } = await client
      .from('categories')
      .insert({ user_id: userId, ...rest, ...(isDefault === undefined ? {} : { is_default: isDefault }) })
      .select(COLUMNS)
      .single()
    if (error) throw error
    return data
  },

  async update(jwt: string, id: string, input: Partial<{ name: string; color: string; icon: string }>): Promise<Category> {
    const client = getScopedClient(jwt)
    const { data, error } = await client.from('categories').update(input).eq('id', id).select(COLUMNS).single()
    if (error) throw error
    return data
  },

  async delete(jwt: string, id: string): Promise<void> {
    const client = getScopedClient(jwt)
    const { error } = await client.from('categories').delete().eq('id', id)
    if (error) throw error
  },
}
