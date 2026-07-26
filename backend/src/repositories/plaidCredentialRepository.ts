import { eq } from 'drizzle-orm'
import { db } from '../lib/db/client.js'
import { plaidCredentials } from '../lib/db/schema.js'
import { decrypt, encrypt } from '../lib/crypto/aes.js'

type Environment = 'sandbox' | 'development' | 'production'

export const plaidCredentialRepository = {
  async upsert(input: { userId: string; clientId: string; secret: string; environment: Environment }): Promise<void> {
    await db
      .insert(plaidCredentials)
      .values({
        userId: input.userId,
        clientId: input.clientId,
        encryptedSecret: encrypt(input.secret),
        environment: input.environment,
      })
      .onConflictDoUpdate({
        target: plaidCredentials.userId,
        set: {
          clientId: input.clientId,
          encryptedSecret: encrypt(input.secret),
          environment: input.environment,
        },
      })
  },

  async getDecrypted(userId: string): Promise<{ clientId: string; secret: string; environment: Environment } | null> {
    const rows = await db.select().from(plaidCredentials).where(eq(plaidCredentials.userId, userId))
    const row = rows[0]
    if (!row) return null
    return {
      clientId: row.clientId,
      secret: decrypt(row.encryptedSecret),
      environment: row.environment as Environment,
    }
  },

  async getMasked(userId: string): Promise<{ clientId: string; environment: Environment; hasSecret: boolean } | null> {
    const rows = await db.select().from(plaidCredentials).where(eq(plaidCredentials.userId, userId))
    const row = rows[0]
    if (!row) return null
    return { clientId: row.clientId, environment: row.environment as Environment, hasSecret: true }
  },
}
