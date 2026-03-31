/** CSS selector for the deck column container element. */
export const COLUMN_SELECTOR = '.deck-column'

/** Extract column theme vars from the nearest `.deck-column` ancestor. */
export function extractColumnThemeVars(
  el: HTMLElement,
): Record<string, string> {
  const column = el.closest(COLUMN_SELECTOR) as HTMLElement | null
  return column ? extractThemeVars(column) : {}
}

/** Extract `--nd-*` inline CSS variables from an element. */
export function extractThemeVars(element: HTMLElement): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const attr of element.style) {
    if (attr.startsWith('--nd-')) {
      vars[attr] = element.style.getPropertyValue(attr)
    }
  }
  return vars
}
