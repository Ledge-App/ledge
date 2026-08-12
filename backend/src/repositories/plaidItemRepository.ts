import { and, eq, isNull } from 'drizzle-orm'
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
    institutionLogo?: string | null
  }): Promise<void> {
    await db.insert(plaidItems).values({
      userId: input.userId,
      institutionId: input.institutionId,
      institutionName: input.institutionName,
      encryptedAccessToken: encrypt(input.accessToken),
      itemId: input.itemId,
      institutionLogo: input.institutionLogo ?? null,
    })
  },

  // Live items only. Every consumer of this (accounts.list, transaction sync, investments,
  // relink replacement) should skip disconnected institutions, so the filter lives here rather
  // than at each call site. Reaching a disconnected item is deliberate and goes through
  // getDecryptedToken.
  async listDecryptedTokens(
    userId: string,
  ): Promise<Array<{ itemId: string; accessToken: string; institutionName: string; institutionId: string; institutionLogo: string | null }>> {
    const rows = await db
      .select()
      .from(plaidItems)
      .where(and(eq(plaidItems.userId, userId), isNull(plaidItems.disabledAt)))
    return rows.map((row) => ({
      itemId: row.itemId,
      accessToken: decrypt(row.encryptedAccessToken),
      institutionName: row.institutionName,
      institutionId: row.institutionId,
      institutionLogo: row.institutionLogo,
    }))
  },

  // Single item by id, disconnected ones included — update-mode Link tokens and re-enabling
  // both need the token of an item that listDecryptedTokens deliberately hides.
  async getDecryptedToken(
    userId: string,
    itemId: string,
  ): Promise<{ itemId: string; accessToken: string; institutionName: string; institutionId: string; disabled: boolean } | null> {
    const rows = await db
      .select()
      .from(plaidItems)
      .where(and(eq(plaidItems.userId, userId), eq(plaidItems.itemId, itemId)))
    const row = rows[0]
    if (!row) return null
    return {
      itemId: row.itemId,
      accessToken: decrypt(row.encryptedAccessToken),
      institutionName: row.institutionName,
      institutionId: row.institutionId,
      disabled: row.disabledAt !== null,
    }
  },

  async setDisabled(userId: string, itemId: string, disabled: boolean): Promise<void> {
    await db
      .update(plaidItems)
      .set({ disabledAt: disabled ? new Date() : null })
      .where(and(eq(plaidItems.userId, userId), eq(plaidItems.itemId, itemId)))
  },

  // '' (fetched, institution has no logo) is a valid value — it is what stops the lazy
  // backfill from re-calling Plaid for logo-less institutions on every accounts.list.
  async updateLogo(userId: string, itemId: string, logo: string): Promise<void> {
    await db
      .update(plaidItems)
      .set({ institutionLogo: logo })
      .where(and(eq(plaidItems.userId, userId), eq(plaidItems.itemId, itemId)))
  },

  // Unlike listDecryptedTokens this keeps disconnected items: the Settings list is where a
  // disconnected institution is reconnected from, so hiding it would strand the connection.
  async list(userId: string): Promise<Array<{ id: string; itemId: string; institutionId: string; institutionName: string; disabled: boolean }>> {
    const rows = await db.select().from(plaidItems).where(eq(plaidItems.userId, userId))
    return rows.map((row) => ({
      id: row.id,
      itemId: row.itemId,
      institutionId: row.institutionId,
      institutionName: row.institutionName,
      disabled: row.disabledAt !== null,
    }))
  },

  async delete(userId: string, itemId: string): Promise<void> {
    await db.delete(plaidItems).where(and(eq(plaidItems.userId, userId), eq(plaidItems.itemId, itemId)))
  },

  // Disconnected items included, unlike listDecryptedTokens. Account deletion has to revoke
  // every Item the user ever linked, and a disconnected one is still live at Plaid — that is
  // the whole point of the soft disconnect. Missing them would leave tokens valid for data
  // the user asked us to erase.
  async listAllDecryptedTokens(userId: string): Promise<Array<{ itemId: string; accessToken: string }>> {
    const rows = await db.select().from(plaidItems).where(eq(plaidItems.userId, userId))
    return rows.map((row) => ({ itemId: row.itemId, accessToken: decrypt(row.encryptedAccessToken) }))
  },
}
