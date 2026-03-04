import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

function stripUnusedFonts(): Plugin {
  return {
    name: 'strip-unused-fonts',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'asset' && typeof chunk.source === 'string' && chunk.fileName.endsWith('.css')) {
          chunk.source = chunk.source
            .replace(/,\s*url\([^)]*\.woff\b[^)]*\)\s*format\("woff"\)/g, '')
            .replace(/,\s*url\([^)]*\.ttf[^)]*\)\s*format\("truetype"\)/g, '')
        }
      }
      for (const name of Object.keys(bundle)) {
        if (/\.(woff|ttf)$/.test(name)) {
          delete bundle[name]
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [vue(), stripUnusedFonts()],
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
