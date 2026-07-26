import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify'
import { verifyJwt } from '../middleware/requireAuth.js'

export function createContext({ req }: CreateFastifyContextOptions) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return { userId: null, jwt: null }
  }

  try {
    const { userId } = verifyJwt(token)
    return { userId, jwt: token }
  } catch {
    return { userId: null, jwt: null }
  }
}

export type Context = ReturnType<typeof createContext>
