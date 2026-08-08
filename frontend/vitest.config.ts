import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    // metro.config.js routes .svg through react-native-svg-transformer; vitest has no such rule,
    // so importing lib/categories/icons.ts would fail on its 18 asset imports. The stub keeps the
    // module importable — tests assert over the registry's keys, never the rendered glyphs.
    {
      name: 'stub-svg-imports',
      enforce: 'pre' as const,
      resolveId(id: string) {
        return id.endsWith('.svg') ? `\0svg-stub:${id}` : null
      },
      load(id: string) {
        return id.startsWith('\0svg-stub:') ? 'export default () => null' : null
      },
    },
  ],
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
