import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    env: {
      // The root router (built in server.ts) transitively imports every repository,
      // which imports the Drizzle/postgres-js client. That client only needs a
      // syntactically valid connection string at import time — postgres-js connects
      // lazily on first query, so no real database is contacted during unit tests.
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
    },
  },
})
