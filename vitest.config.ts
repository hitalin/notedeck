import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import JSON5 from 'json5'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

function json5Plugin(): Plugin {
  return {
    name: 'json5',
    transform(code, id) {
      if (!id.endsWith('.json5')) return undefined
      const parsed = JSON5.parse(code)
      return { code: `export default ${JSON.stringify(parsed)}`, map: null }
    },
  }
}

export default defineConfig({
  // biome-ignore lint/suspicious/noExplicitAny: vite v7/v8 Plugin type mismatch
  plugins: [vue() as any, json5Plugin() as any],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/main.ts'],
    },
  },
})
