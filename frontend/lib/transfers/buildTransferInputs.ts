import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { TransferKind } from '@/types/domain'

export interface TransferCreateInput {
  kind: TransferKind
  expensePlaidTransactionId: string | null
  expenseManualTransactionId: string | null
  incomePlaidTransactionId: string | null
  incomeManualTransactionId: string | null
  amount: string
  note: string | null
}

export interface PendingTransfer {
  kind: TransferKind
  counterpartIds: string[]
}

// Every screen that lists transactions has to turn "this item, marked as <kind>, linked to these
// counterparts" into transfer rows. Shared so the Transactions tab, the dashboard and the account
// detail sheet can't drift apart on which leg is the expense or what amount gets recorded.
export function buildTransferInputs(item: FeedItem, pending: PendingTransfer, feed: FeedItem[]): TransferCreateInput[] {
  const isReimbursement = pending.kind === 'reimbursement'
  // No counterpart selected still creates a transfer: a one-legged transfer is how an item gets
  // excluded from totals when its other side isn't in the feed at all.
  const counterpartIds = pending.counterpartIds.length > 0 ? pending.counterpartIds : [null]

  return counterpartIds.map((counterpartId) => {
    const counterpart = counterpartId ? feed.find((i) => i.id === counterpartId) ?? null : null
    const isExpense = item.amount > 0
    const expenseItem = isExpense ? item : counterpart
    const incomeItem = isExpense ? counterpart : item
    return {
      kind: pending.kind,
      expensePlaidTransactionId: expenseItem?.source === 'plaid' ? expenseItem.id : null,
      expenseManualTransactionId: expenseItem?.source === 'manual' ? expenseItem.id : null,
      incomePlaidTransactionId: incomeItem?.source === 'plaid' ? incomeItem.id : null,
      incomeManualTransactionId: incomeItem?.source === 'manual' ? incomeItem.id : null,
      // A reimbursement is only partial — it records what came back, not what was spent, so its
      // amount always comes off the income leg whichever side the user started from. Every other
      // kind pairs equal amounts, so the marked item's own amount is fine.
      amount: isReimbursement && incomeItem ? Math.abs(incomeItem.amount).toFixed(2) : Math.abs(item.amount).toFixed(2),
      note: null,
    }
  })
}
