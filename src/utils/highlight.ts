import { createHighlighterCoreSync, createJavaScriptRegexEngine } from 'shiki'
import bash from 'shiki/dist/langs/bash.mjs'
import c from 'shiki/dist/langs/c.mjs'
import cpp from 'shiki/dist/langs/cpp.mjs'
import css from 'shiki/dist/langs/css.mjs'
import go from 'shiki/dist/langs/go.mjs'
import html from 'shiki/dist/langs/html.mjs'
import java from 'shiki/dist/langs/java.mjs'
import javascript from 'shiki/dist/langs/javascript.mjs'
import json from 'shiki/dist/langs/json.mjs'
import kotlin from 'shiki/dist/langs/kotlin.mjs'
import markdown from 'shiki/dist/langs/markdown.mjs'
import python from 'shiki/dist/langs/python.mjs'
import ruby from 'shiki/dist/langs/ruby.mjs'
import rust from 'shiki/dist/langs/rust.mjs'
import sql from 'shiki/dist/langs/sql.mjs'
import typescript from 'shiki/dist/langs/typescript.mjs'
import yaml from 'shiki/dist/langs/yaml.mjs'
import darkPlus from 'shiki/dist/themes/dark-plus.mjs'

const highlighter = createHighlighterCoreSync({
  themes: [darkPlus],
  langs: [
    bash,
    c,
    cpp,
    css,
    go,
    html,
    java,
    javascript,
    json,
    kotlin,
    markdown,
    python,
    ruby,
    rust,
    sql,
    typescript,
    yaml,
  ],
  engine: createJavaScriptRegexEngine(),
})

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function highlightCode(code: string, lang: string | null): string {
  if (!lang || !highlighter.getLoadedLanguages().includes(lang)) {
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
  return highlighter.codeToHtml(code, { lang, theme: 'dark-plus' })
}
