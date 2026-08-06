import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Expo's metro resolver handles '@/' in the app bundle; vitest needs it spelled out. Only
  // type-only '@/' imports worked before (esbuild erases them) — runtime ones need this alias.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
  },
})
