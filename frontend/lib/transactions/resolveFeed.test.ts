import { describe, expect, it } from 'vitest'
import { resolveCategory } from './resolveFeed'
import type { TransactionOverride, VendorMapping } from '@/types/domain'

const overrides: TransactionOverride[] = [
  { id: 'o1', plaidTransactionId: 'txn-override', categoryId: 'cat-override', subcategoryId: null },
]
const vendorMappings: VendorMapping[] = [
  { id: 'v1', vendorName: 'Panda Express', categoryId: 'cat-user', subcategoryId: 'sub-user', source: 'user_defined' },
  { id: 'v2', vendorName: 'Panda Express', categoryId: 'cat-auto', subcategoryId: null, source: 'plaid_auto' },
  { id: 'v3', vendorName: 'Only Auto Vendor', categoryId: 'cat-auto-only', subcategoryId: null, source: 'plaid_auto' },
]

describe('resolveCategory', () => {
  it('prefers a transaction_override over any vendor mapping', () => {
    const result = resolveCategory({ transactionId: 'txn-override', merchantName: 'Panda Express' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: 'cat-override', subcategoryId: null, categorySource: 'override' })
  })

  it('prefers a user_defined vendor mapping over a plaid_auto one for the same merchant', () => {
    const result = resolveCategory({ transactionId: 'txn-other', merchantName: 'Panda Express' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: 'cat-user', subcategoryId: 'sub-user', categorySource: 'user_defined' })
  })

  it('falls back to plaid_auto when no user_defined mapping exists for the merchant', () => {
    const result = resolveCategory({ transactionId: 'txn-other', merchantName: 'Only Auto Vendor' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: 'cat-auto-only', subcategoryId: null, categorySource: 'plaid_auto' })
  })

  it('falls back to uncategorized when nothing matches', () => {
    const result = resolveCategory({ transactionId: 'txn-unknown', merchantName: 'Unknown Merchant' }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: null, subcategoryId: null, categorySource: 'uncategorized' })
  })

  it('falls back to uncategorized when merchantName is null', () => {
    const result = resolveCategory({ transactionId: 'txn-null-merchant', merchantName: null }, overrides, vendorMappings)
    expect(result).toEqual({ categoryId: null, subcategoryId: null, categorySource: 'uncategorized' })
  })
})
