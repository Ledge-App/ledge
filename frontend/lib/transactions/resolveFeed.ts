import type { ManualTransaction, PlaidTransaction, Reimbursement, TransactionOverride, Transfer, TransferKind, VendorMapping } from '@/types/domain'

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
  // Plaid's PFC detailed code (e.g. 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT'), null for manual
  // transactions. Carried for transfer auto-detection's confidence gate — category display
  // still goes through the resolution chain above, never this raw code.
  pfcDetailed: string | null
  accountId: string | null
  pending: boolean
  note: string | null
  reimbursedAmount: number | null
  netAmount: number | null
  isReimbursementIncome: boolean
  reimbursementCategoryId: string | null
  transferId: string | null
  transferKind: TransferKind | null
  transferRole: 'expense' | 'income' | null
  // Who created the transfer this leg belongs to: 'auto' = transfer auto-detection, so the
  // UI can badge it and offer one-tap undo. Null when the item isn't a transfer leg.
  transferSource: 'manual' | 'auto' | null
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
      pfcDetailed: txn.personal_finance_category?.detailed ?? null,
      accountId: txn.account_id,
      pending: txn.pending,
      note: null,
      reimbursedAmount: null,
      netAmount: null,
      isReimbursementIncome: false,
      reimbursementCategoryId: null,
      transferId: null,
      transferKind: null,
      transferRole: null,
      transferSource: null,
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
    pfcDetailed: null,
    accountId: null,
    pending: false,
    note: txn.note,
    reimbursedAmount: null,
    netAmount: null,
    isReimbursementIncome: false,
    reimbursementCategoryId: null,
    transferId: null,
    transferKind: null,
    transferRole: null,
    transferSource: null,
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

// Stamps both legs of every transfer so downstream code can badge them and leave them out of
// totals. A transfer may be unpaired (no income leg), in which case only the expense is stamped.
// Reimbursement-kind transfers are handled differently: the expense leg gets reimbursedAmount /
// netAmount (like the old reimbursements table), and the income leg is marked as reimbursement
// income — they are NOT excluded from totals the way other transfer kinds are.
export function applyTransfers(feed: FeedItem[], transfers: Transfer[]): FeedItem[] {
  const nonReimbursement: Transfer[] = []
  const reimbursementTransfers: Transfer[] = []
  for (const t of transfers) {
    if (t.kind === 'reimbursement') reimbursementTransfers.push(t)
    else nonReimbursement.push(t)
  }

  // --- Non-reimbursement transfers: 1:1, stamp transferId/Kind/Role ---
  const byExpenseId = new Map<string, Transfer>()
  const byIncomeId = new Map<string, Transfer>()
  for (const transfer of nonReimbursement) {
    const expenseId = transfer.expensePlaidTransactionId ?? transfer.expenseManualTransactionId
    if (expenseId) byExpenseId.set(expenseId, transfer)
    const incomeId = transfer.incomePlaidTransactionId ?? transfer.incomeManualTransactionId
    if (incomeId) byIncomeId.set(incomeId, transfer)
  }

  // --- Reimbursement transfers: many-to-one on expense side ---
  const reimbByExpenseId = new Map<string, Transfer[]>()
  const reimbByIncomeId = new Map<string, Transfer>()
  for (const t of reimbursementTransfers) {
    const expenseId = t.expensePlaidTransactionId ?? t.expenseManualTransactionId
    if (expenseId) {
      const list = reimbByExpenseId.get(expenseId) ?? []
      list.push(t)
      reimbByExpenseId.set(expenseId, list)
    }
    const incomeId = t.incomePlaidTransactionId ?? t.incomeManualTransactionId
    if (incomeId) reimbByIncomeId.set(incomeId, t)
  }

  const categoryByFeedId = new Map(feed.map((item) => [item.id, item.categoryId]))

  return feed.map((item) => {
    // Non-reimbursement transfer legs
    const asExpense = byExpenseId.get(item.id)
    if (asExpense) {
      return { ...item, transferId: asExpense.id, transferKind: asExpense.kind, transferRole: 'expense' as const, transferSource: asExpense.source }
    }
    const asIncome = byIncomeId.get(item.id)
    if (asIncome) {
      return { ...item, transferId: asIncome.id, transferKind: asIncome.kind, transferRole: 'income' as const, transferSource: asIncome.source }
    }

    // Reimbursement expense side: accumulate amounts, set netAmount
    const reimbLinks = reimbByExpenseId.get(item.id)
    if (reimbLinks) {
      const reimbursedAmount = reimbLinks.reduce((sum, t) => sum + Number(t.amount), 0)
      const netAmount = Math.max(0, item.amount - reimbursedAmount)
      return { ...item, reimbursedAmount, netAmount }
    }

    // Reimbursement income side: mark as reimbursement income, carry expense's category
    const reimbIncome = reimbByIncomeId.get(item.id)
    if (reimbIncome) {
      const expenseId = reimbIncome.expensePlaidTransactionId ?? reimbIncome.expenseManualTransactionId
      const expenseCategoryId = expenseId ? categoryByFeedId.get(expenseId) ?? null : null
      return { ...item, isReimbursementIncome: true, reimbursementCategoryId: expenseCategoryId }
    }

    return item
  })
}
