import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import { verifyJwt } from '../middleware/requireAuth.js'

export async function createContext({ req }: CreateFastifyContextOptions) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return { userId: null, email: null, jwt: null }
  }

  try {
    const { userId, email } = await verifyJwt(token)
    return { userId, email, jwt: token }
  } catch {
    return { userId: null, email: null, jwt: null }
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
