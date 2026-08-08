import { DEFAULT_PFC_MAPPING } from '../lib/plaid/pfc.js'
import { categoryRepository } from '../repositories/categoryRepository.js'
import { subcategoryRepository } from '../repositories/subcategoryRepository.js'
import { plaidCategoryMappingRepository } from '../repositories/plaidCategoryMappingRepository.js'
import { vendorMappingRepository } from '../repositories/vendorMappingRepository.js'
import { categorizationService } from './categorizationService.js'

interface PlaidTransactionLike {
  merchant_name: string | null
  personal_finance_category: { primary: string; detailed: string }
}

export const onboardingService = {
  async seedCategories(jwt: string, userId: string): Promise<{ categoryIdsByLedgeName: Record<string, string> }> {
    const existing = await categoryRepository.list(jwt)
    if (existing.length > 0) {
      const categoryIdsByLedgeName: Record<string, string> = {}
      for (const cat of existing) {
        categoryIdsByLedgeName[cat.name] = cat.id
      }
      return { categoryIdsByLedgeName }
    }

    const categoryIdsByLedgeName: Record<string, string> = {}

    for (const entry of DEFAULT_PFC_MAPPING) {
      const category = await categoryRepository.create(jwt, userId, {
        name: entry.ledgeCategory,
        color: entry.color,
        icon: entry.icon,
        isDefault: true,
      })
      categoryIdsByLedgeName[entry.ledgeCategory] = category.id

      for (const subcategoryName of entry.subcategories) {
        await subcategoryRepository.create(jwt, userId, { categoryId: category.id, name: subcategoryName })
      }

      for (const detailedCode of entry.detailedCodes) {
        await plaidCategoryMappingRepository.create(jwt, userId, {
          plaidPfcPrimary: entry.primary,
          plaidPfcDetailed: detailedCode,
          categoryId: category.id,
        })
      }
    }

    return { categoryIdsByLedgeName }
  },

  async generateVendorMappings(
    jwt: string,
    userId: string,
    transactions: PlaidTransactionLike[],
  ): Promise<{ createdCount: number }> {
    const mappings = await plaidCategoryMappingRepository.list(jwt)
    const seenVendors = new Set<string>()
    let createdCount = 0

    for (const transaction of transactions) {
      const vendorName = transaction.merchant_name
      if (!vendorName || seenVendors.has(vendorName)) continue

      const resolved = categorizationService.resolveCategory(mappings, transaction.personal_finance_category)
      if (!resolved) continue

      await vendorMappingRepository.upsert(jwt, userId, {
        vendorName,
        categoryId: resolved.categoryId,
        subcategoryId: null,
        source: 'plaid_auto',
      })
      seenVendors.add(vendorName)
      createdCount += 1
    }

    return { createdCount }
  },
}
