import type { CompiledProps } from './types'

export function applyTheme(compiled: CompiledProps): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(compiled)) {
    root.style.setProperty(`--nd-${key}`, value)
  }

  // Set color-scheme for native UI elements
  const bg = compiled.bg
  if (bg) {
    const isLight = isLightColor(bg)
    root.style.setProperty('color-scheme', isLight ? 'light' : 'dark')
    root.dataset.colorScheme = isLight ? 'light' : 'dark'
  }
}

function isLightColor(color: string): boolean {
  // Simple luminance check via hex
  const hex = color.replace('#', '')
  if (hex.length !== 6 && hex.length !== 3) return false
  const r =
    hex.length === 3
      ? parseInt(hex[0]! + hex[0]!, 16)
      : parseInt(hex.slice(0, 2), 16)
  const g =
    hex.length === 3
      ? parseInt(hex[1]! + hex[1]!, 16)
      : parseInt(hex.slice(2, 4), 16)
  const b =
    hex.length === 3
      ? parseInt(hex[2]! + hex[2]!, 16)
      : parseInt(hex.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 128
}
