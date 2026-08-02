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
