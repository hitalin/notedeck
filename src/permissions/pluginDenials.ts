/**
 * plugin principal の permission_denied の受動 surface (#712 §8.4)。
 *
 * Mk:api gate / dispatcher の拒否を pluginId 別に in-memory 記録し、
 * プラグインカラムの該当行に拒否バッジを出す。破壊的変更 (plugin プロファイル
 * 分離で今まで動いていたウィジェットが止まる) をリリースノート (= 説明書)
 * 依存にしないための in-app 導線。
 *
 * - toast は出さない: イベント駆動で Nd:call するウィジェットは拒否を高頻度に
 *   反復するため、能動通知は spam 化する。受動バッジのみ
 * - 永続化しない: 監査ログは非目標。直近状態のみ (アプリ再起動で消える)
 */

import { reactive } from 'vue'

export interface PluginDenialEntry {
  /** 直近に拒否された対象 (capability id または Mk:api endpoint) */
  lastTarget: string
  /** 直近拒否の必要キー (permission_denied の denied keys) */
  lastKeys: string[]
  count: number
}

const _denials = reactive(new Map<string, PluginDenialEntry>())

/** pluginId (`widget:<id>` 含む) の拒否を記録する。 */
export function recordPluginDenial(
  pluginId: string,
  target: string,
  keys: readonly string[],
): void {
  const existing = _denials.get(pluginId)
  if (existing) {
    existing.lastTarget = target
    existing.lastKeys = [...keys]
    existing.count += 1
  } else {
    _denials.set(pluginId, {
      lastTarget: target,
      lastKeys: [...keys],
      count: 1,
    })
  }
}

/** バッジ表示用。無ければ null。 */
export function getPluginDenial(pluginId: string): PluginDenialEntry | null {
  return _denials.get(pluginId) ?? null
}

/** プラグイン無効化 / アンインストール時のクリア。 */
export function clearPluginDenial(pluginId: string): void {
  _denials.delete(pluginId)
}

/** @internal テスト用 */
export function _clearPluginDenialsForTest(): void {
  _denials.clear()
}
