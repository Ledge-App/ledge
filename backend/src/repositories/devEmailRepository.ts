import { eq } from 'drizzle-orm'
import { db } from '../lib/db/client.js'
import { devEmails } from '../lib/db/schema.js'

export const devEmailRepository = {
  async isAllowed(email: string | null): Promise<boolean> {
    if (!email) return false
    const rows = await db.select().from(devEmails).where(eq(devEmails.email, email.trim().toLowerCase()))
    return rows.length > 0
  },
}
