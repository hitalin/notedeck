import DOMPurify from 'dompurify'
import type { HighlighterCore } from 'shiki'
import { shallowRef } from 'vue'

export const highlighterLoaded = shallowRef(false)

let highlighter: HighlighterCore | null = null

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

;(async () => {
  try {
    const [shikiCore, themeModule, ...langModules] = await Promise.all([
      import('shiki'),
      import('shiki/dist/themes/dark-plus.mjs'),
      import('shiki/dist/langs/bash.mjs'),
      import('shiki/dist/langs/c.mjs'),
      import('shiki/dist/langs/cpp.mjs'),
      import('shiki/dist/langs/css.mjs'),
      import('shiki/dist/langs/go.mjs'),
      import('shiki/dist/langs/html.mjs'),
      import('shiki/dist/langs/java.mjs'),
      import('shiki/dist/langs/javascript.mjs'),
      import('shiki/dist/langs/json.mjs'),
      import('shiki/dist/langs/kotlin.mjs'),
      import('shiki/dist/langs/markdown.mjs'),
      import('shiki/dist/langs/python.mjs'),
      import('shiki/dist/langs/ruby.mjs'),
      import('shiki/dist/langs/rust.mjs'),
      import('shiki/dist/langs/sql.mjs'),
      import('shiki/dist/langs/typescript.mjs'),
      import('shiki/dist/langs/yaml.mjs'),
    ])

    highlighter = shikiCore.createHighlighterCoreSync({
      themes: [themeModule.default],
      langs: langModules.map((m) => m.default),
      engine: shikiCore.createJavaScriptRegexEngine(),
    })
    highlighterLoaded.value = true
  } catch {
    // Graceful degradation: code blocks render as plain text
  }
})()

export function highlightCode(code: string, lang: string | null): string {
  if (!lang || !highlighter?.getLoadedLanguages().includes(lang)) {
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
  return DOMPurify.sanitize(
    highlighter.codeToHtml(code, { lang, theme: 'dark-plus' }),
  )
}
