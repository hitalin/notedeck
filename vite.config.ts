import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'

function stripUnusedFonts(): Plugin {
  return {
    name: 'strip-unused-fonts',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (
          chunk.type === 'asset' &&
          typeof chunk.source === 'string' &&
          chunk.fileName.endsWith('.css')
        ) {
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
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('node_modules/vue/') ||
            id.includes('node_modules/vue-router/') ||
            id.includes('node_modules/pinia/')
          ) {
            return 'vendor-vue'
          }
          if (id.includes('node_modules/@syuilo/aiscript/')) {
            return 'vendor-aiscript'
          }
          if (
            id.includes('node_modules/@codemirror/') ||
            id.includes('node_modules/@lezer/')
          ) {
            return 'vendor-codemirror'
          }
        },
        minify: {
          compress: {
            dropConsole: true,
          },
        },
      },
    },
  },
  clearScreen: false,
  server: {
    strictPort: true,
  },
})
