import type { Shortcut } from '@/commands/registry'

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)

export function shortcutLabel(s: Shortcut): string {
  const parts: string[] = []
  if (s.ctrl) parts.push(isMac ? '\u2318' : 'Ctrl')
  if (s.shift) parts.push(isMac ? '\u21E7' : 'Shift')
  if (s.alt) parts.push(isMac ? '\u2325' : 'Alt')
  parts.push(formatKey(s.key))
  return parts.join(isMac ? '' : '+')
}

function formatKey(key: string): string {
  if (key.length === 1) return key.toUpperCase()
  const map: Record<string, string> = {
    Escape: 'Esc',
    ArrowUp: '\u2191',
    ArrowDown: '\u2193',
    ArrowLeft: '\u2190',
    ArrowRight: '\u2192',
    Enter: '\u21B5',
    Backspace: '\u232B',
    Delete: 'Del',
    ' ': 'Space',
  }
  return map[key] ?? key
}
