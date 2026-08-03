import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // auth.users is Supabase-managed — schema.ts only references it for FK typing,
  // it must never be created/altered/dropped by our own migrations.
  schemaFilter: ['public'],
})
