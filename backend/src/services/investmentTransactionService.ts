import { plaidCredentialRepository } from '../repositories/plaidCredentialRepository.js'
import { plaidItemRepository } from '../repositories/plaidItemRepository.js'
import { createPlaidClient } from '../lib/plaid/client.js'
import { plaidItemErrorDetail } from '../lib/plaid/errors.js'
import { investmentRepository, type InvestmentTransaction } from '../repositories/investmentRepository.js'
import { preconditionError } from '../trpc/errors.js'

export interface InvestmentTransactionItemError {
  itemId: string
  message: string
  /** Plaid's error_code. PRODUCTS_NOT_SUPPORTED and ADDITIONAL_CONSENT_REQUIRED both land here
   *  and only one of them is worth ever telling the user about. */
  errorCode?: string
}

export interface InvestmentTransactionResult {
  /** Keyed by item id because the client caches per item (investment-transfers:<itemId>). */
  byItem: Record<string, InvestmentTransaction[]>
  itemErrors: InvestmentTransactionItemError[]
}

export const investmentTransactionService = {
  async fetch(userId: string, startDate: string, endDate: string): Promise<InvestmentTransactionResult> {
    const creds = await plaidCredentialRepository.getDecrypted(userId)
    if (!creds) throw preconditionError('No Plaid credentials saved for this user.')
    const client = createPlaidClient(creds.clientId, creds.secret, creds.environment)
    const items = await plaidItemRepository.listDecryptedTokens(userId)

    const byItem: Record<string, InvestmentTransaction[]> = {}
    const itemErrors: InvestmentTransactionItemError[] = []

    for (const item of items) {
      try {
        byItem[item.itemId] = await investmentRepository.getTransactions(
          client,
          item.accessToken,
          startDate,
          endDate,
        )
      } catch (err) {
        // Institutions without the investments product (PRODUCTS_NOT_SUPPORTED) and items
        // linked before optional_products was added (ADDITIONAL_CONSENT_REQUIRED) both land
        // here. Isolated per item, matching transactionSyncService: the outflow on the other
        // side simply stays counted, which is the safe direction.
        itemErrors.push({
          itemId: item.itemId,
          ...plaidItemErrorDetail(err, 'Could not load investment activity.'),
        })
      }
    }

    // Relay only — nothing here is written to a table.
    return { byItem, itemErrors }
  },
}
