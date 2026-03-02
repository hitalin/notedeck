import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-aiscript': ['@syuilo/aiscript'],
          'vendor-codemirror': [
            '@codemirror/autocomplete',
            '@codemirror/commands',
            '@codemirror/language',
            '@codemirror/lint',
            '@codemirror/state',
            '@codemirror/view',
            '@lezer/highlight',
          ],
          'vendor-shiki': ['shiki'],
        },
      },
    },
  },
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  clearScreen: false,
  server: {
    strictPort: true,
  },
})
