import type { ManualTransaction, PlaidTransaction, Reimbursement, TransactionOverride, VendorMapping } from '@/types/domain'

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

export interface FeedItem {
  id: string
  source: 'plaid' | 'manual'
  amount: number // Plaid convention: positive = money out (expense), negative = money in (income)
  date: string
  merchantName: string
  categoryId: string | null
  subcategoryId: string | null
  categorySource: CategorySource
  confidenceLevel: string | null
  accountId: string | null
  pending: boolean
  note: string | null
  reimbursedAmount: number | null
  netAmount: number | null
  isReimbursementIncome: boolean
  reimbursementCategoryId: string | null
}

export function mergeFeed(
  plaidTransactions: PlaidTransaction[],
  manualTransactions: ManualTransaction[],
  overrides: TransactionOverride[],
  vendorMappings: VendorMapping[],
): FeedItem[] {
  const plaidItems: FeedItem[] = plaidTransactions.map((txn) => {
    const resolved = resolveCategory(
      { transactionId: txn.transaction_id, merchantName: txn.merchant_name ?? null },
      overrides,
      vendorMappings,
    )
    return {
      id: txn.transaction_id,
      source: 'plaid',
      amount: txn.amount,
      date: txn.date,
      merchantName: txn.merchant_name ?? txn.name,
      categoryId: resolved.categoryId,
      subcategoryId: resolved.subcategoryId,
      categorySource: resolved.categorySource,
      confidenceLevel: txn.personal_finance_category?.confidence_level ?? null,
      accountId: txn.account_id,
      pending: txn.pending,
      note: null,
      reimbursedAmount: null,
      netAmount: null,
      isReimbursementIncome: false,
      reimbursementCategoryId: null,
    }
  })

  const manualItems: FeedItem[] = manualTransactions.map((txn) => ({
    id: txn.id,
    source: 'manual',
    amount: txn.type === 'expense' ? Number(txn.amount) : -Number(txn.amount),
    date: txn.date,
    merchantName: txn.note ?? (txn.type === 'expense' ? 'Manual expense' : 'Manual income'),
    categoryId: txn.categoryId,
    subcategoryId: txn.subcategoryId,
    categorySource: txn.categoryId ? 'user_defined' : 'uncategorized',
    confidenceLevel: null,
    accountId: null,
    pending: false,
    note: txn.note,
    reimbursedAmount: null,
    netAmount: null,
    isReimbursementIncome: false,
    reimbursementCategoryId: null,
  }))

  return [...plaidItems, ...manualItems].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export function applyReimbursements(feed: FeedItem[], reimbursements: Reimbursement[]): FeedItem[] {
  const reimbursementsByExpenseId = new Map<string, Reimbursement[]>()
  for (const r of reimbursements) {
    const expenseId = r.expensePlaidTransactionId ?? r.expenseManualTransactionId
    if (!expenseId) continue
    const list = reimbursementsByExpenseId.get(expenseId) ?? []
    list.push(r)
    reimbursementsByExpenseId.set(expenseId, list)
  }

  const categoryByFeedId = new Map(feed.map((item) => [item.id, item.categoryId]))
  const incomeIdToExpenseCategoryId = new Map<string, string | null>()
  for (const r of reimbursements) {
    const incomeId = r.incomePlaidTransactionId ?? r.incomeManualTransactionId
    if (!incomeId) continue
    const expenseId = r.expensePlaidTransactionId ?? r.expenseManualTransactionId
    incomeIdToExpenseCategoryId.set(incomeId, expenseId ? categoryByFeedId.get(expenseId) ?? null : null)
  }

  return feed.map((item) => {
    const linked = reimbursementsByExpenseId.get(item.id)
    if (linked) {
      const reimbursedAmount = linked.reduce((sum, r) => sum + Number(r.amount), 0)
      const netAmount = Math.max(0, item.amount - reimbursedAmount)
      return { ...item, reimbursedAmount, netAmount }
    }
    if (incomeIdToExpenseCategoryId.has(item.id)) {
      return { ...item, isReimbursementIncome: true, reimbursementCategoryId: incomeIdToExpenseCategoryId.get(item.id) ?? null }
    }
    return item
  })
}
