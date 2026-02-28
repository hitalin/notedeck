import { linter, type Diagnostic } from '@codemirror/lint'
import { Parser } from '@syuilo/aiscript'

export const aiscriptLinter = linter(
  (view) => {
    const diagnostics: Diagnostic[] = []
    const code = view.state.doc.toString()
    if (!code.trim()) return diagnostics

    try {
      const parser = new Parser()
      parser.parse(code)
    } catch (e) {
      if (e instanceof Error) {
        // Try to extract line info from error message
        const lineMatch = e.message.match(/at line (\d+)/i)
        let from = 0
        let to = code.length

        if (lineMatch) {
          const lineNum = parseInt(lineMatch[1], 10)
          const line = view.state.doc.line(Math.min(lineNum, view.state.doc.lines))
          from = line.from
          to = line.to
        }

        diagnostics.push({
          from,
          to,
          severity: 'error',
          message: e.message,
        })
      }
    }

    return diagnostics
  },
  { delay: 500 },
)
