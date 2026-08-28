import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { fastifyTRPCPlugin, type FastifyTRPCPluginOptions } from '@trpc/server/adapters/fastify'
import { appRouter, type AppRouter } from './trpc/router.js'
import { createContext } from './trpc/context.js'
import { logTrpcError } from './trpc/errorLogging.js'

/**
 * `logDestination` exists so tests can read what the server logs. pino writes straight to file
 * descriptor 1 through sonic-boom, so stdout cannot be spied on from the test process; an
 * injected stream is the only way to assert on real log output. Unset in every non-test caller,
 * which leaves Fastify's default stdout logger exactly as it was.
 */
export function buildServer(options: { logDestination?: NodeJS.WritableStream } = {}) {
  // tRPC's httpBatchLink joins every batched procedure name into one comma-separated
  // path segment (e.g. "accounts.list,manualTransactions.list,..."). Fastify's default
  // maxParamLength (100) is meant for normal dynamic route params, not this — a handful
  // of batched queries easily exceeds it, causing find-my-way to reject the route and
  // Fastify to return its generic 404 instead of ever reaching the tRPC handler.
  //
  // trustProxy: behind Vercel, req.ip is otherwise the proxy's address, which would
  // collapse every caller into one rate-limit bucket.
  const server = Fastify({
    logger: options.logDestination ? { stream: options.logDestination } : true,
    maxParamLength: 5000,
    trustProxy: true,
  })

  // The only browser client is the local `expo start --web` preview — production traffic
  // is the native app, which never sends an Origin. Granting only localhost keeps prod
  // browser origins shut out without breaking the dev preview.
  server.register(cors, { origin: [/^https?:\/\/localhost(:\d+)?$/] })

  // Keyed by user when a bearer token is present (stable across mobile IP churn),
  // by IP otherwise. In-memory, so per-instance on serverless — a partial but real
  // brake on brute force and on driving unlimited probe calls at Plaid.
  server.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      // The whole token, not a prefix: a JWT's first segment is the header, which is
      // identical for every user and would collapse them into one bucket.
      const auth = req.headers.authorization
      return auth?.startsWith('Bearer ') ? auth.slice(7) : (req.ip ?? 'unknown')
    },
  })

  server.get('/health', async () => ({ status: 'ok' }))

  server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
      // Without this a failed procedure is invisible: tRPC answers its own errors, so they never
      // reach Fastify's error handler and the access log shows only a status code — and for a
      // batched request (which is every request the app makes) that status is 207, indisting-
      // uishable from success. req.log is the child logger, so lines carry the same reqId as the
      // surrounding request pair.
      onError: ({ error, path, type, req, ctx }) =>
        logTrpcError(req.log, { error, path, type, userId: ctx?.userId ?? null }),
    },
    // Annotated so the onError callback's parameters are contextually typed rather than implicit
    // any — the plugin cannot infer the router from a bare object literal.
  } satisfies FastifyTRPCPluginOptions<AppRouter>)

  return server
}

async function start() {
  const server = buildServer()
  const port = Number(process.env.PORT) || 3000
  await server.listen({ port, host: '0.0.0.0' })
}

// Vercel imports buildServer() into a serverless handler (see api/index.ts) rather
// than running this file directly — it must never call .listen() itself there.
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  start()
}
