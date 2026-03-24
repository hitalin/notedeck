import { type Diagnostic, linter } from '@codemirror/lint'
import type { Extension } from '@codemirror/state'
import JSON5 from 'json5'

/**
 * Create a CodeMirror linter extension for JSON5 syntax validation.
 *
 * Shared by ProfileEditorContent and ThemeEditorContent.
 */
export function createJson5Linter(delay = 500): Extension {
  return linter(
    (view) => {
      const diagnostics: Diagnostic[] = []
      const code = view.state.doc.toString()
      if (!code.trim()) return diagnostics
      try {
        JSON5.parse(code)
      } catch (e) {
        if (e instanceof Error) {
          const lineMatch = e.message.match(/at (\d+):(\d+)/)
          let from = 0
          let to = code.length
          if (lineMatch) {
            const lineNum = Number.parseInt(lineMatch[1] ?? '1', 10)
            const line = view.state.doc.line(
              Math.min(lineNum, view.state.doc.lines),
            )
            from = line.from
            to = line.to
          }
          diagnostics.push({ from, to, severity: 'error', message: e.message })
        }
      }
      return diagnostics
    },
    { delay },
  )
}
