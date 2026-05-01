/**
 * Capability registry — AI tool calling のための capability 登録・lookup API。
 *
 * Phase 2 A-3.1 ではモジュールスコープの Map で管理する (UI コマンドパレット
 * の `useCommandStore` とは別レイヤー)。Phase 2 A-3.2 以降で `useCommandStore`
 * の `aiTool: true` な command も自動的にこの registry へ流し込む統合を予定。
 *
 * `time.now` 等の builtin は `registerBuiltinCapabilities()` で起動時にまとめ
 * て登録する。
 */

import type { Command } from '@/commands/registry'

const capabilities = new Map<string, Command>()

/** Capability を registry に登録する。`aiTool: true` 必須。 */
export function registerCapability(cmd: Command): void {
  if (!cmd.aiTool) {
    throw new Error(
      `Capability "${cmd.id}" must have aiTool: true to be registered`,
    )
  }
  if (!cmd.signature) {
    throw new Error(
      `Capability "${cmd.id}" must have a signature to be registered`,
    )
  }
  capabilities.set(cmd.id, cmd)
}

export function unregisterCapability(id: string): void {
  capabilities.delete(id)
}

export function getCapability(id: string): Command | undefined {
  return capabilities.get(id)
}

export function listCapabilities(): Command[] {
  return [...capabilities.values()]
}

/**
 * @internal テスト用。Production code から呼ばないこと。
 * registry をクリアして isolated test を可能にする。
 */
export function _clearCapabilitiesForTest(): void {
  capabilities.clear()
}
