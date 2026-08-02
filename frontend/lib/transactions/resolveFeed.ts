import type { TransactionOverride, VendorMapping } from '@/types/domain'

export type CategorySource = 'override' | 'user_defined' | 'plaid_auto' | 'uncategorized'

export interface ResolvedCategory {
  categoryId: string | null
  subcategoryId: string | null
  categorySource: CategorySource
}

// Implements product.md's 4-step category resolution order:
// transaction_overrides > user_defined vendor_mappings > plaid_auto vendor_mappings > Uncategorized.
export function resolveCategory(
  txn: { transactionId: string; merchantName: string | null },
  overrides: TransactionOverride[],
  vendorMappings: VendorMapping[],
): ResolvedCategory {
  const override = overrides.find((o) => o.plaidTransactionId === txn.transactionId)
  if (override) {
    return { categoryId: override.categoryId, subcategoryId: override.subcategoryId, categorySource: 'override' }
  }

  const userDefined = txn.merchantName
    ? vendorMappings.find((v) => v.vendorName === txn.merchantName && v.source === 'user_defined')
    : undefined
  if (userDefined) {
    return { categoryId: userDefined.categoryId, subcategoryId: userDefined.subcategoryId, categorySource: 'user_defined' }
  }

  const plaidAuto = txn.merchantName
    ? vendorMappings.find((v) => v.vendorName === txn.merchantName && v.source === 'plaid_auto')
    : undefined
  if (plaidAuto) {
    return { categoryId: plaidAuto.categoryId, subcategoryId: plaidAuto.subcategoryId, categorySource: 'plaid_auto' }
  }

  return { categoryId: null, subcategoryId: null, categorySource: 'uncategorized' }
}
