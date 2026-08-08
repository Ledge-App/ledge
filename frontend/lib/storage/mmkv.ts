import { MMKV } from 'react-native-mmkv'
import type { PlaidTransaction } from '@/types/domain'

const storage = new MMKV({ id: 'ledge-transaction-cache' })

function transactionsKey(itemId: string): string {
  return `transactions:${itemId}`
}

function cursorKey(itemId: string): string {
  return `cursor:${itemId}`
}

export function getCachedTransactions(itemId: string): PlaidTransaction[] {
  const raw = storage.getString(transactionsKey(itemId))
  if (!raw) return []
  try {
    return JSON.parse(raw) as PlaidTransaction[]
  } catch {
    // A corrupted cache entry must not crash the feed — treat it as empty and let the
    // next sync rebuild it from Plaid.
    return []
  }
}

export function setCachedTransactions(itemId: string, transactions: PlaidTransaction[]): void {
  storage.set(transactionsKey(itemId), JSON.stringify(transactions))
}

export function getCursor(itemId: string): string | undefined {
  return storage.getString(cursorKey(itemId))
}

export function setCursor(itemId: string, cursor: string): void {
  storage.set(cursorKey(itemId), cursor)
}

// Plaid `removed` transaction ids not yet checked against the transfers table (orphan
// cleanup, docs/credit-card-payment-auto-transfer.md phase 6). Durable on purpose: a
// removal is emitted exactly once by transactionsSync, and once the merge drops the
// transaction from the cache its absence is indistinguishable from "outside the history
// window" — so losing this queue (e.g. app killed before the sweep ran) would leave a
// transfer referencing a retracted leg forever, silently hiding the surviving leg's spend.
const PENDING_REMOVED_KEY = 'pending-removed-transaction-ids'
const PENDING_REMOVED_CAP = 500

export function getPendingRemovedTransactionIds(): string[] {
  const raw = storage.getString(PENDING_REMOVED_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

export function setPendingRemovedTransactionIds(ids: string[]): void {
  storage.set(PENDING_REMOVED_KEY, JSON.stringify(ids.slice(-PENDING_REMOVED_CAP)))
}

export function appendPendingRemovedTransactionIds(ids: string[]): void {
  if (ids.length === 0) return
  const merged = new Set(getPendingRemovedTransactionIds())
  for (const id of ids) merged.add(id)
  setPendingRemovedTransactionIds(Array.from(merged))
}
