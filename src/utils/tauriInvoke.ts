/**
 * Typed invoke wrapper powered by tauri-specta bindings.
 *
 * `commands` — auto-generated typed command object (dev ビルドで src/bindings.ts に出力).
 * `unwrap()` — Result<T, E> を従来の invoke 互換に変換（成功時 T、失敗時 throw）.
 *
 * "[TAURI] Couldn't find callback id" warnings during HMR/reload are harmless
 * Tauri-side messages that cannot be suppressed from JS.
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import type { Result } from '@/bindings'

export { commands } from '@/bindings'

/**
 * Unwrap a tauri-specta Result into the raw value, throwing on error.
 * Compatible with existing try/catch patterns used throughout the codebase.
 */
export function unwrap<T, E = unknown>(result: Result<T, E>): T {
  if (result.status === 'ok') return result.data
  throw result.error
}

const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

/**
 * @deprecated Use `commands.*` from `@/utils/tauriInvoke` instead.
 */
const mockHandlers: Record<string, (args: unknown) => unknown> = {}

function mockInvoke(cmd: string, args?: unknown): Promise<unknown> {
  const handler = mockHandlers[cmd]
  if (handler) {
    return Promise.resolve(handler(args))
  }
  console.warn(`[mock invoke] unhandled command: ${cmd}`, args)
  return Promise.resolve(null)
}

/**
 * @deprecated Use `commands.*` from `@/utils/tauriInvoke` instead.
 */
export const invoke: typeof tauriInvoke = isTauri
  ? tauriInvoke
  : (mockInvoke as typeof tauriInvoke)

/**
 * @deprecated Use `commands.*` from `@/utils/tauriInvoke` instead.
 */
export function registerMockHandler(
  cmd: string,
  handler: (args: unknown) => unknown,
) {
  mockHandlers[cmd] = handler
}
