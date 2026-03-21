/**
 * Manages custom CSS injection into the document.
 * Handles splitting @import/@font-face rules (which CSSStyleSheet.replaceSync ignores)
 * into <style> elements, while remaining rules use adoptedStyleSheets.
 */

/**
 * Split @import / @font-face rules from the rest of CSS.
 * replaceSync() silently ignores these at-rules, so they must be
 * injected via a regular <style> element for browsers / Android WebView
 * to actually fetch external fonts.
 */
export function splitAtRules(css: string): {
  atRules: string
  rest: string
} {
  const atRuleLines: string[] = []
  const restLines: string[] = []
  let inFontFace = false
  let braceDepth = 0
  for (const line of css.split('\n')) {
    const trimmed = line.trim()
    if (inFontFace) {
      atRuleLines.push(line)
      braceDepth += (line.match(/\{/g) || []).length
      braceDepth -= (line.match(/\}/g) || []).length
      if (braceDepth <= 0) inFontFace = false
      continue
    }
    if (trimmed.startsWith('@import')) {
      atRuleLines.push(line)
    } else if (trimmed.startsWith('@font-face')) {
      inFontFace = true
      braceDepth =
        (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length
      if (braceDepth <= 0) inFontFace = false
      atRuleLines.push(line)
    } else {
      restLines.push(line)
    }
  }
  return { atRules: atRuleLines.join('\n'), rest: restLines.join('\n') }
}

export class CustomCssManager {
  private sheet: CSSStyleSheet | null = null
  private atRuleStyle: HTMLStyleElement | null = null

  apply(css: string): void {
    if (!css) {
      this.remove()
      return
    }

    const { atRules, rest } = splitAtRules(css)

    // Inject @import / @font-face via <style> element
    if (atRules.trim()) {
      if (!this.atRuleStyle) {
        this.atRuleStyle = document.createElement('style')
        this.atRuleStyle.setAttribute('data-nd-custom-atrules', '')
        document.head.appendChild(this.atRuleStyle)
      }
      this.atRuleStyle.textContent = atRules
    } else if (this.atRuleStyle) {
      this.atRuleStyle.remove()
      this.atRuleStyle = null
    }

    // Apply remaining rules via adoptedStyleSheets
    if (!this.sheet) {
      this.sheet = new CSSStyleSheet()
    }
    this.sheet.replaceSync(rest)
    // Always re-append to ensure it's last (highest priority)
    document.adoptedStyleSheets = [
      ...document.adoptedStyleSheets.filter((s) => s !== this.sheet),
      this.sheet,
    ]
  }

  remove(): void {
    if (this.sheet) {
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (s) => s !== this.sheet,
      )
      this.sheet = null
    }
    if (this.atRuleStyle) {
      this.atRuleStyle.remove()
      this.atRuleStyle = null
    }
  }
}
