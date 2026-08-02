import type { RemovedTransaction, Transaction } from 'plaid'
import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'
import { transactionRepository } from '../repositories/transactionRepository.js'

export interface TransactionSyncItemError {
  itemId: string
  message: string
}

export interface TransactionSyncResult {
  added: Transaction[]
  modified: Transaction[]
  removed: RemovedTransaction[]
  cursors: Record<string, string>
  hasMore: boolean
  itemErrors: TransactionSyncItemError[]
}

export const transactionSyncService = {
  async sync(userId: string, cursors: Record<string, string>): Promise<TransactionSyncResult> {
    const creds = await plaidCredentialRepository.getDecrypted(userId)
    if (!creds) throw new Error('No Plaid credentials saved for this user.')
    const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)
    const items = await plaidItemRepository.listDecryptedTokens(userId)

    const added: Transaction[] = []
    const modified: Transaction[] = []
    const removed: RemovedTransaction[] = []
    const nextCursors: Record<string, string> = {}
    const itemErrors: TransactionSyncItemError[] = []
    let hasMore = false

    for (const item of items) {
      const cursor = cursors[item.itemId] ?? ''
      try {
        const page = await transactionRepository.sync(client, item.accessToken, cursor)
        added.push(...page.added)
        modified.push(...page.modified)
        removed.push(...page.removed)
        nextCursors[item.itemId] = page.next_cursor
        hasMore = hasMore || page.has_more
      } catch (err) {
        // One user's misconfigured/broken Plaid item must not block sync for their other
        // items (architecture.md's BYOK isolation tradeoff). Cursor is left unset so the
        // next sync retries this item from where it last succeeded.
        itemErrors.push({ itemId: item.itemId, message: err instanceof Error ? err.message : 'Sync failed for this account.' })
      }
    }

    // Relay only — nothing here is written to a table (see Constraint 10 in the plan header).
    return { added, modified, removed, cursors: nextCursors, hasMore, itemErrors }
  },
}
