/**
 * Plaid returns its error detail in the Axios response body, not on the Error instance, so
 * every reader needs the same three-level optional walk. This was inlined as a one-off cast in
 * transactionSyncService; rate-limit handling made it a second reader, hence the extraction.
 */
export interface PlaidErrorDetail {
  errorType?: string
  errorCode?: string
  errorMessage?: string
}

export function plaidErrorOf(err: unknown): PlaidErrorDetail {
  const data = (
    err as { response?: { data?: { error_type?: string; error_code?: string; error_message?: string } } }
  )?.response?.data
  return { errorType: data?.error_type, errorCode: data?.error_code, errorMessage: data?.error_message }
}

/** A per-item failure as the client receives it: something to show, plus something to act on. */
export interface PlaidItemErrorDetail {
  message: string
  /** Plaid's error_code, absent when the failure wasn't a Plaid response (network, timeout). */
  errorCode?: string
}

/**
 * Describes a rejected Plaid call for a single item.
 *
 * The Plaid SDK is axios-based, so a rejected call's `err.message` is only ever
 * "Request failed with status code 400" — the diagnosis is in the response body. Every per-item
 * handler used to report that axios string, which is why a broken connection could not be told
 * apart from an unsupported product or expired consent, all three of which need different
 * remedies.
 */
export function plaidItemErrorDetail(err: unknown, fallbackMessage: string): PlaidItemErrorDetail {
  const { errorCode, errorMessage } = plaidErrorOf(err)
  const message = errorMessage ?? (err instanceof Error ? err.message : fallbackMessage)
  return errorCode ? { message, errorCode } : { message }
}

/**
 * True for the whole RATE_LIMIT_EXCEEDED family (RATE_LIMIT, TRANSACTIONS_LIMIT,
 * ADDITION_LIMIT, ...). Matching on error_type rather than enumerating codes on purpose: the
 * code list grows, and every member means the same thing to us — back off and retry later.
 */
export function isRateLimitError(err: unknown): boolean {
  return plaidErrorOf(err).errorType === 'RATE_LIMIT_EXCEEDED'
}
