import { and, eq } from 'drizzle-orm'
import { db } from '../lib/db/client.js'
import { plaidItems } from '../lib/db/schema.js'
import { decrypt, encrypt } from '../lib/crypto/aes.js'

export const plaidItemRepository = {
  async create(input: {
    userId: string
    institutionId: string
    institutionName: string
    accessToken: string
    itemId: string
  }): Promise<void> {
    await db.insert(plaidItems).values({
      userId: input.userId,
      institutionId: input.institutionId,
      institutionName: input.institutionName,
      encryptedAccessToken: encrypt(input.accessToken),
      itemId: input.itemId,
    })
  },

  async listDecryptedTokens(
    userId: string,
  ): Promise<Array<{ itemId: string; accessToken: string; institutionName: string }>> {
    const rows = await db.select().from(plaidItems).where(eq(plaidItems.userId, userId))
    return rows.map((row) => ({
      itemId: row.itemId,
      accessToken: decrypt(row.encryptedAccessToken),
      institutionName: row.institutionName,
    }))
  },

  async list(userId: string): Promise<Array<{ id: string; itemId: string; institutionId: string; institutionName: string }>> {
    const rows = await db.select().from(plaidItems).where(eq(plaidItems.userId, userId))
    return rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      institutionId: row.institutionId,
      institutionName: row.institutionName,
    }))
  },

  async delete(userId: string, itemId: string): Promise<void> {
    await db.delete(plaidItems).where(and(eq(plaidItems.userId, userId), eq(plaidItems.itemId, itemId)))
  },
}
