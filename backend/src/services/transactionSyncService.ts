import type { RemovedTransaction, Transaction } from 'plaid'
import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'
import { transactionRepository } from '../repositories/transactionRepository.js'
import { isRateLimitError, plaidErrorOf } from '../lib/plaid/errors.js'

export interface TransactionSyncItemError {
  itemId: string
  message: string
}

export interface TransactionSyncResult {
  added: Transaction[]
  modified: Transaction[]
  removed: RemovedTransaction[]
  cursors: Record<string, string>
  /**
   * Per item: true only when MAX_PAGES_PER_ITEM was hit before the item drained, meaning the
   * client should trigger another sync to keep draining. Per-item (not one OR'd boolean) so a
   * client re-syncing one undrained item doesn't interpret the flag as "re-sync everything".
   */
  hasMore: Record<string, boolean>
  /**
   * Items whose paging stopped because Plaid rate-limited us, not because they drained. Their
   * `hasMore` is true — the progress already made is real and more remains — so a client that
   * re-fires immediately would just be throttled again, harder. Honour this by backing off
   * before the next round; the driver (lib/transactions/syncDriver.ts) is what does that.
   *
   * Deliberately not an `itemError`: being throttled is not a broken connection, and reporting
   * it as one would put a scary, unactionable message in front of the user.
   */
  rateLimited: Record<string, true>
  itemErrors: TransactionSyncItemError[]
}

// Bounds one request's work per item so a freshly linked account's initial history (potentially
// years, has_more=true across many pages) can't run a serverless invocation into its timeout.
// 10 pages x count=500 = up to 5000 transactions per item per request; the client keeps
// re-syncing while any hasMore flag is true, so the drain completes across a few requests.
const MAX_PAGES_PER_ITEM = 10

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
    const hasMore: Record<string, boolean> = {}
    const rateLimited: Record<string, true> = {}
    const itemErrors: TransactionSyncItemError[] = []

    for (const item of items) {
      const originalCursor = cursors[item.itemId] ?? ''
      let cursor = originalCursor
      try {
        // Drain this item page by page. The cursor is recorded after every successful page, so
        // an error partway through leaves a valid resume point (the client's merge is idempotent
        // by transaction_id, so re-fetching a page is harmless).
        for (let page = 1; ; page++) {
          const data = await transactionRepository.sync(client, item.accessToken, cursor)
          added.push(...data.added)
          modified.push(...data.modified)
          removed.push(...data.removed)
          cursor = data.next_cursor
          nextCursors[item.itemId] = cursor
          if (!data.has_more) {
            hasMore[item.itemId] = false
            break
          }
          if (page >= MAX_PAGES_PER_ITEM) {
            hasMore[item.itemId] = true
            break
          }
        }
      } catch (err) {
        // Throttling is handled before the generic failure path: no itemError, and hasMore is
        // set true rather than left unset, because unlike a broken item this one genuinely has
        // pages left. Whatever cursor the last successful page recorded stays in nextCursors as
        // the resume point; if page 1 was the one throttled, nothing is returned for this item
        // and the client simply keeps the cursor it already had.
        if (isRateLimitError(err)) {
          hasMore[item.itemId] = true
          rateLimited[item.itemId] = true
          continue
        }
        // One user's misconfigured/broken Plaid item must not block sync for their other
        // items (architecture.md's BYOK isolation tradeoff). hasMore is left unset so the
        // client doesn't hot-loop on a failing item; the next app-driven sync retries it.
        itemErrors.push({ itemId: item.itemId, message: err instanceof Error ? err.message : 'Sync failed for this account.' })
        // Plaid requires restarting pagination from the cursor it began with when the
        // underlying data mutated mid-pagination; discard this item's partial progress.
        if (plaidErrorOf(err).errorCode === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') {
          if (originalCursor) nextCursors[item.itemId] = originalCursor
          else delete nextCursors[item.itemId]
        }
      }
    }

    // Relay only — nothing here is written to a table (see Constraint 10 in the plan header).
    return { added, modified, removed, cursors: nextCursors, hasMore, rateLimited, itemErrors }
  },
}
