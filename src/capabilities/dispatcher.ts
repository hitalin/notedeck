/**
 * Capability dispatcher — capability ID + params を受けて execute() を呼ぶ。
 *
 * - permissions チェックを通過した capability のみ実行
 * - 未登録 / permission 拒否 / 実行失敗を構造化エラーで区別して返す
 * - execute() は同期 / 非同期どちらでも対応
 *
 * Phase 2 A-3.2 で AI tool dispatcher (tool_use → これ → tool_result) の中核
 * として呼ばれる。Phase 1 の `ai.json5` permissions と同じスキーマで照合する
 * ので、ユーザーが `safe` プリセットを選んでいれば書き込み系は自動 deny される。
 */

import {
  type AiConfig,
  type PermissionKey,
  resolvePermissions,
} from '@/composables/useAiConfig'
import { sanitizeToolName } from './identifier'
import { getCapability, listCapabilities } from './registry'

export type DispatchErrorCode =
  | 'unknown_capability'
  | 'permission_denied'
  | 'execute_failed'

export type DispatchResult =
  | { ok: true; result: unknown }
  | { ok: false; code: DispatchErrorCode; error: string }

/**
 * Capability を呼ぶ。permissions が通れば execute → 結果を返す。
 * AI tool calling 経路では戻り値を tool_result として AI に返送する。
 */
export async function dispatchCapability(
  capabilityId: string,
  params: Record<string, unknown> | undefined,
  aiConfig: AiConfig,
): Promise<DispatchResult> {
  // capabilityId は (a) registry に格納されている dotted id (`time.now`) か、
  // (b) Anthropic / OpenAI が返す sanitized name (`time_now`) のどちらかで
  // 来る可能性がある。前者は直接 lookup、後者は逆引きで解決する。
  let cap = getCapability(capabilityId)
  if (!cap) {
    cap = listCapabilities().find(
      (c) => sanitizeToolName(c.id) === capabilityId,
    )
  }
  if (!cap) {
    return {
      ok: false,
      code: 'unknown_capability',
      error: `Capability "${capabilityId}" is not registered`,
    }
  }
  const denied = checkPermissions(cap.permissions ?? [], aiConfig)
  if (denied.length > 0) {
    return {
      ok: false,
      code: 'permission_denied',
      error: `Permission denied for ${capabilityId}: required [${denied.join(', ')}] not allowed by current ai.json5 settings`,
    }
  }
  try {
    const result = await cap.execute(params)
    return { ok: true, result }
  } catch (e) {
    return {
      ok: false,
      code: 'execute_failed',
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/** required permission のうち config で disallow になっているものを返す。 */
function checkPermissions(
  required: readonly PermissionKey[],
  aiConfig: AiConfig,
): PermissionKey[] {
  if (required.length === 0) return []
  const resolved = resolvePermissions(aiConfig.permissions)
  return required.filter((key) => !resolved[key])
}
