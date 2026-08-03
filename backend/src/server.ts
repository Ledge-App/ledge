import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { appRouter } from './trpc/router.js'
import { createContext } from './trpc/context.js'

export function buildServer() {
  // tRPC's httpBatchLink joins every batched procedure name into one comma-separated
  // path segment (e.g. "accounts.list,manualTransactions.list,..."). Fastify's default
  // maxParamLength (100) is meant for normal dynamic route params, not this — a handful
  // of batched queries easily exceeds it, causing find-my-way to reject the route and
  // Fastify to return its generic 404 instead of ever reaching the tRPC handler.
  const server = Fastify({ logger: true, maxParamLength: 5000 })

  server.register(cors, { origin: true })

  server.get('/health', async () => ({ status: 'ok' }))

  server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: { router: appRouter, createContext },
  })

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
