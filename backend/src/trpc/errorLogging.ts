import { plaidErrorOf } from '../lib/plaid/errors.js'

/**
 * Codes that mean "the client asked for something it can't have" rather than "we broke".
 * A signed-out app polling, a validation rejection or a stale id is ordinary traffic; logging
 * those at error level is how an error log becomes noise nobody reads.
 */
const EXPECTED_CODES = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'BAD_REQUEST',
  'PRECONDITION_FAILED',
  'CONFLICT',
  'TOO_MANY_REQUESTS',
])

/** What the client is told in place of an internal error's real message. */
export const REDACTED_MESSAGE = 'Something went wrong. Please try again.'

interface LoggerLike {
  warn(detail: object, message: string): void
  error(detail: object, message: string): void
}

interface TrpcErrorLike {
  code: string
  message: string
  cause?: unknown
}

export interface TrpcErrorEvent {
  error: TrpcErrorLike
  path?: string
  type: string
  /** Accepted so callers can pass tRPC's event straight through — deliberately never logged. */
  input?: unknown
  userId?: string | null
}

/**
 * The backend's only error log line.
 *
 * Without it a failed procedure left no trace at all: tRPC handles its own errors, so they never
 * reach Fastify's error handler, and the access log records nothing but a status code. Worse,
 * a batch containing a failure returns HTTP 207 — so even the status code looked like a success,
 * and since every client request is batched that was effectively all of them.
 *
 * The input is accepted but never logged. Log lines are persistence, and inputs carry cursors,
 * amounts and transaction ids that must not be stored server-side (architecture.md constraint
 * 11). The user id is kept: an opaque uuid is what makes a user's report traceable to a line
 * here, and it is not financial data.
 */
export function logTrpcError(log: LoggerLike, event: TrpcErrorEvent): void {
  const { error, path, type, userId } = event
  // A Plaid failure's message is only ever "Request failed with status code 400"; the code that
  // says what to actually do about it is in the response body hanging off the cause.
  const plaid = plaidErrorOf(error.cause)
  const detail = {
    trpc: { path: path ?? '<unknown>', type, code: error.code },
    ...(plaid.errorType || plaid.errorCode ? { plaid } : {}),
    ...(userId ? { userId } : {}),
    // `err` is pino's conventional key for a serialized Error — message, type and stack.
    err: error,
  }

  if (EXPECTED_CODES.has(error.code)) {
    log.warn(detail, 'trpc request rejected')
    return
  }
  log.error(detail, 'trpc procedure failed')
}

/**
 * Keeps an internal error's message out of the response body.
 *
 * tRPC omits the stack outside development but still ships the raw message, which for an
 * unhandled throw is whatever the failure said — a database host and port, a Postgres constraint
 * name, a Plaid internal. Redacting unconditionally rather than only in production: the message
 * is now in the server log either way, so there is no environment where reading it off the wire
 * is the right habit.
 *
 * Every message the app deliberately shows a user is thrown as a typed TRPCError, which is
 * exactly what makes it survive this.
 */
export function redactInternalMessage<T extends { message: string }>(shape: T, code: string): T {
  if (code !== 'INTERNAL_SERVER_ERROR') return shape
  return { ...shape, message: REDACTED_MESSAGE }
}
