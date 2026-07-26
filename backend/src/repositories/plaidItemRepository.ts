import { eq } from 'drizzle-orm'
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
}
