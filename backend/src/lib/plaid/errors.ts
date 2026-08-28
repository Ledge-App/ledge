/**
 * Plaid returns its error detail in the Axios response body, not on the Error instance, so
 * every reader needs the same three-level optional walk. This was inlined as a one-off cast in
 * transactionSyncService; rate-limit handling made it a second reader, hence the extraction.
 */
export interface PlaidErrorDetail {
  errorType?: string
  errorCode?: string
}

export function plaidErrorOf(err: unknown): PlaidErrorDetail {
  const data = (err as { response?: { data?: { error_type?: string; error_code?: string } } })?.response?.data
  return { errorType: data?.error_type, errorCode: data?.error_code }
}

/**
 * True for the whole RATE_LIMIT_EXCEEDED family (RATE_LIMIT, TRANSACTIONS_LIMIT,
 * ADDITION_LIMIT, ...). Matching on error_type rather than enumerating codes on purpose: the
 * code list grows, and every member means the same thing to us — back off and retry later.
 */
export function isRateLimitError(err: unknown): boolean {
  return plaidErrorOf(err).errorType === 'RATE_LIMIT_EXCEEDED'
}
