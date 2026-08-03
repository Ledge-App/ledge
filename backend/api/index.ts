import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../src/server.js'

// Reused across warm invocations of the same serverless instance — building a fresh
// Fastify app (and re-registering every route) on every request would be wasteful and
// would break plugins that do one-time setup.
let appPromise: Promise<FastifyInstance> | undefined

function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    const app = buildServer()
    appPromise = Promise.resolve(app.ready()).then(() => app)
  }
  return appPromise
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp()
  app.server.emit('request', req, res)
}
