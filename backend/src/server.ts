import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify'
import { appRouter } from './trpc/router.js'
import { createContext } from './trpc/context.js'

export function buildServer() {
  const server = Fastify({ logger: true })

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

if (process.env.NODE_ENV !== 'test') {
  start()
}
