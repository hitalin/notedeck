/** Extract `--nd-*` inline CSS variables from an element. */
export function extractThemeVars(
  element: HTMLElement,
): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const attr of element.style) {
    if (attr.startsWith('--nd-')) {
      vars[attr] = element.style.getPropertyValue(attr)
    }
  }
  return vars
}
