import type { PlaidCategoryMapping } from '../repositories/plaidCategoryMappingRepository.js'

export const categorizationService = {
  resolveCategory(
    mappings: PlaidCategoryMapping[],
    pfc: { primary: string; detailed: string },
  ): { categoryId: string } | null {
    const detailedMatch = mappings.find((m) => m.plaidPfcDetailed === pfc.detailed)
    if (detailedMatch) return { categoryId: detailedMatch.categoryId }

    const primaryMatch = mappings.find((m) => m.plaidPfcPrimary === pfc.primary && m.plaidPfcDetailed === null)
    if (primaryMatch) return { categoryId: primaryMatch.categoryId }

    return null
  },
}
