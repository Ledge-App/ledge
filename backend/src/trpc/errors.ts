import { TRPCError } from '@trpc/server'
import { redactInternalMessage } from './errorLogging.js'

/**
 * A condition the user can do something about, thrown so its message survives to the client.
 *
 * The distinction matters now that `redactInternalMessage` replaces the text of anything that
 * reaches the client as INTERNAL_SERVER_ERROR. A bare `throw new Error('...')` is that case: it
 * gets logged in full and shown as a generic apology, which is right for a bug or a
 * misconfiguration and wrong for "you haven't connected Plaid yet". Typing the error is what
 * separates the two.
 */
export function preconditionError(message: string): TRPCError {
  return new TRPCError({ code: 'PRECONDITION_FAILED', message })
}

export function notFoundError(message: string): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message })
}

/** Re-exported so callers reasoning about client-visible messages have one import. */
export { redactInternalMessage }
