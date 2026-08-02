import type { Category, PlaidCategoryMapping } from '@/types/domain'

export interface PfcOwner {
  categoryId: string
  categoryName: string
}

// Only mappings with a detailed (not primary-only) code are relevant to the per-code
// picker UI — primary-only fallback mappings aren't individually selectable there.
export function resolvePfcOwnership(mappings: PlaidCategoryMapping[], categories: Category[]): Map<string, PfcOwner> {
  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const owners = new Map<string, PfcOwner>()

  for (const mapping of mappings) {
    if (!mapping.plaidPfcDetailed) continue
    const category = categoryById.get(mapping.categoryId)
    if (!category) continue
    owners.set(mapping.plaidPfcDetailed, { categoryId: category.id, categoryName: category.name })
  }

  return owners
}
