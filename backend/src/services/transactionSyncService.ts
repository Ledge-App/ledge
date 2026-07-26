import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'
import { transactionRepository } from '../repositories/transactionRepository.js'

export const transactionSyncService = {
  async sync(userId: string, cursors: Record<string, string>) {
    const creds = await plaidCredentialRepository.getDecrypted(userId)
    if (!creds) throw new Error('No Plaid credentials saved for this user.')
    const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)
    const items = await plaidItemRepository.listDecryptedTokens(userId)

    const added: unknown[] = []
    const modified: unknown[] = []
    const removed: unknown[] = []
    const nextCursors: Record<string, string> = {}
    let hasMore = false

    for (const item of items) {
      const cursor = cursors[item.itemId] ?? ''
      const page = await transactionRepository.sync(client, item.accessToken, cursor)
      added.push(...page.added)
      modified.push(...page.modified)
      removed.push(...page.removed)
      nextCursors[item.itemId] = page.next_cursor
      hasMore = hasMore || page.has_more
    }

    // Relay only — nothing here is written to a table (see Constraint 1 in the plan header).
    return { added, modified, removed, cursors: nextCursors, hasMore }
  },
}
