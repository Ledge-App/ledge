import { z } from 'zod'
import { publicProcedure, router } from '../trpc/trpc.js'
import { sendToAxiom } from '../lib/observability/axiom.js'
import { runAfterResponse } from '../lib/observability/afterResponse.js'

export const observabilityRouter = router({
  /**
   * The frontend's one way to report a failure nobody would otherwise see. Public, not
   * protected: the most important case this exists for — an auth failure — by definition has
   * no session, so a protected procedure could never receive it.
   *
   * Deliberately minimal input. No free-form detail blob: that would make this a second path
   * for financial data to reach a log line, which is exactly the boundary
   * trpc/errorLogging.ts's redaction already exists to hold.
   */
  reportClientError: publicProcedure
    .input(
      z.object({
        scope: z.string().min(1).max(100),
        message: z.string().min(1).max(500),
        name: z.string().max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Public doesn't mean anonymous: createContext resolves ctx.userId from the bearer token
      // whenever one is present, independent of whether the procedure requires it — a report
      // from a still-signed-in user (a background sync failure, say) carries it for free.
      // Genuinely unauthenticated reports (the auth-failure case this exists for) are tagged
      // as such rather than silently blended in with attributed ones — a public, unthrottled
      // endpoint can be hit by anyone who knows the URL, and an incident view needs to be able
      // to tell "our users are seeing this" apart from unverified noise.
      const service = ctx.userId ? 'tofi-frontend' : 'tofi-frontend-unverified'
      // Same non-blocking-on-Vercel treatment as the backend's own error events (server.ts's
      // onSend hook) — the caller (reportError) doesn't wait on this either.
      await runAfterResponse(
        sendToAxiom([
          {
            _time: new Date().toISOString(),
            level: 'error',
            service,
            env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
            scope: input.scope,
            ...(ctx.userId ? { userId: ctx.userId } : {}),
            err: { type: input.name ?? 'Error', message: input.message },
          },
        ]),
      )
      return { ok: true }
    }),
})
