/**
 * principal → 実効権限の解決 (#712)。
 *
 * PR 1a: 既存 `ai.json5` の 3 プロファイルを principal 別に読み分けるだけで、
 * 実効権限は従来と同値 (挙動変更ゼロ)。保存の permissions.json5 移行は PR 1b、
 * principal 別プロファイルの実効化 (plugin 分離 / floor / clamp) は PR 1c。
 */

import {
  type PermissionKey,
  type PermissionsConfig,
  resolvePermissions,
  useAiConfig,
} from '@/composables/useAiConfig'
import type { Principal } from './principal'

/**
 * principal が従う権限プロファイルを返す。user は null (プロファイル無し =
 * 常時許可)。
 *
 * - `ai.chat` / `plugin`: chat プロファイル (plugin の独立分離は PR 1c)
 * - `ai.heartbeat`: chat プロファイル (現状の enforce と同じ。ai.heartbeat
 *   単独 resolve への切替 = 潜在バグ修正は PR 1b の AND 初期化とセットで行う)
 * - `external`: `httpApi.permissions` (従来の合成ハックと同値)
 */
export function profileFor(principal: Principal): PermissionsConfig | null {
  if (principal.kind === 'user') return null
  const { config } = useAiConfig()
  return principal.kind === 'external'
    ? config.value.httpApi.permissions
    : config.value.permissions
}

/**
 * principal の実効 granted map。user は null (常時許可の意)。
 * dispatcher の実行時 enforce と、meta 系の自己申告表示が共有する唯一の判定。
 */
export function resolveFor(
  principal: Principal,
): Record<PermissionKey, boolean> | null {
  const profile = profileFor(principal)
  if (!profile) return null
  return resolvePermissions(profile)
}
