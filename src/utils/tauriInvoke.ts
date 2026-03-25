/**
 * Re-export Tauri's invoke for centralized import path.
 *
 * "[TAURI] Couldn't find callback id" warnings during HMR/reload are harmless
 * Tauri-side messages that cannot be suppressed from JS. A previous attempt to
 * block invoke calls via a "disposing" flag caused all API calls to silently
 * fail when beforeunload fired without an actual unload, resulting in
 * spontaneous mass logouts.
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core'

const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window

/**
 * ブラウザ単体開発時（task dev）のモック invoke。
 * Tauri 環境では本物の invoke をそのまま使う。
 * モックハンドラは mockHandlers に追加可能。
 */
const mockHandlers: Record<string, (args: unknown) => unknown> = {
  // 例: get_credentials_or_anon: () => ({ type: 'anon' }),
}

function mockInvoke(cmd: string, args?: unknown): Promise<unknown> {
  const handler = mockHandlers[cmd]
  if (handler) {
    return Promise.resolve(handler(args))
  }
  console.warn(`[mock invoke] unhandled command: ${cmd}`, args)
  return Promise.resolve(null)
}

export const invoke: typeof tauriInvoke = isTauri
  ? tauriInvoke
  : (mockInvoke as typeof tauriInvoke)

/**
 * ブラウザ開発時にモックハンドラを登録する。
 * テストや開発用 setup スクリプトから利用。
 */
export function registerMockHandler(
  cmd: string,
  handler: (args: unknown) => unknown,
) {
  mockHandlers[cmd] = handler
}
