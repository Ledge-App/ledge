// Orphan cleanup (docs/credit-card-payment-auto-transfer.md, phase 6).
//
// A transfer row can outlive its premise in two ways:
//
// 1. RETRACTION — Plaid emits a leg in `removed` (bounced/reversed payment, pending-style
//    id replacement). The merge drops the transaction from the cache, but the transfer row
//    survives and keeps the other leg excluded from totals — real spending silently hidden,
//    the one failure the design must never allow. Detection is EVENT-driven: only ids Plaid
//    explicitly removed (queued durably in MMKV) count. Cache *absence* is never evidence —
//    a leg outside the loaded history window, or missing after a cache rebuild, is
//    indistinguishable from retracted, and dissolving on absence would wrongly re-count
//    legitimate transfers.
//
// 2. DRIFT — a `modified` leg's amount or sign changed so the exact-amount pairing premise
//    broke. Scoped to source 'auto' ONLY: auto transfers are always paired Plaid legs
//    created on exact amounts, so any present leg that disagrees is proof the premise is
//    gone. Manual transfers are exempt by design — the sheet's account_transfer matcher
//    tolerates ±5%, so a manual transfer's amount may legitimately differ from a leg's, and
//    the user vouched for the pair regardless.
//
// Dissolving never writes a dismissal: the pair wasn't rejected by the user, it ceased to
// exist — a corrected/re-posted payment must be free to auto-match again.

import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Transfer } from '@/types/domain'

export interface OrphanCleanupInput {
  transfers: Transfer[]
  /** Resolved feed items keyed by id (Plaid transaction id for plaid-sourced items). */
  feedById: Map<string, FeedItem>
  /** Plaid `removed` ids not yet reconciled against the transfers table. */
  pendingRemovedIds: string[]
}

export interface OrphanCleanupResult {
  /** Transfers to delete: a leg was retracted, or an auto pair's amounts no longer hold. */
  dissolveTransferIds: string[]
  /**
   * Pending-removed ids referenced by NO transfer — safe to clear from the queue. Ids that
   * still reference a transfer stay queued until that transfer's deletion lands (verified
   * through the refetched list on the next pass), so a failed delete is retried, never lost.
   */
  clearableRemovedIds: string[]
}

function cents(amount: number | string): number {
  return Math.round(Math.abs(Number(amount)) * 100)
}

/** A present leg must keep the role's sign and the transfer's exact amount to the cent. */
function legBroken(leg: FeedItem | undefined, transfer: Transfer, role: 'expense' | 'income'): boolean {
  if (!leg) return false // absent ≠ retracted: outside the window or cache rebuilt — no conclusion
  if (role === 'expense' && leg.amount <= 0) return true
  if (role === 'income' && leg.amount >= 0) return true
  return cents(leg.amount) !== cents(transfer.amount)
}

export function findOrphanedTransfers(input: OrphanCleanupInput): OrphanCleanupResult {
  const { transfers, feedById, pendingRemovedIds } = input

  const removed = new Set(pendingRemovedIds)
  const dissolve = new Set<string>()
  const referencedRemovedIds = new Set<string>()

  for (const transfer of transfers) {
    const legs = [transfer.expensePlaidTransactionId, transfer.incomePlaidTransactionId]

    // 1. Retraction: any transfer (any kind, any source) referencing a removed leg.
    for (const legId of legs) {
      if (legId && removed.has(legId)) {
        dissolve.add(transfer.id)
        referencedRemovedIds.add(legId)
      }
    }

    // 2. Drift: auto transfers whose present legs no longer carry the paired amounts.
    if (transfer.source === 'auto') {
      const expense = transfer.expensePlaidTransactionId ? feedById.get(transfer.expensePlaidTransactionId) : undefined
      const income = transfer.incomePlaidTransactionId ? feedById.get(transfer.incomePlaidTransactionId) : undefined
      if (legBroken(expense, transfer, 'expense') || legBroken(income, transfer, 'income')) {
        dissolve.add(transfer.id)
      }
    }
  }

  return {
    dissolveTransferIds: Array.from(dissolve),
    clearableRemovedIds: pendingRemovedIds.filter((id) => !referencedRemovedIds.has(id)),
  }
}
