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
    .mutation(async ({ input }) => {
      // Same non-blocking-on-Vercel treatment as the backend's own error events (server.ts's
      // onSend hook) — the caller (reportError) doesn't wait on this either.
      await runAfterResponse(
        sendToAxiom([
          {
            _time: new Date().toISOString(),
            level: 'error',
            service: 'tofi-frontend',
            env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
            scope: input.scope,
            err: { type: input.name ?? 'Error', message: input.message },
          },
        ]),
      )
      return { ok: true }
    }),
})
