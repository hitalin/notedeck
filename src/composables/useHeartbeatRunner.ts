/**
 * HEARTBEAT (#411) — JS 側の runner。
 *
 * Rust scheduler から `nd:ai-heartbeat-tick` event が来たら:
 *   1. このカラムの tick かフィルタ
 *   2. cheap check (preset ごと、AI を呼ばずローカル判定)
 *   3. cheap check が positive なら AI inference (heartbeat 専用 system prompt)
 *   4. AI 応答が "HEARTBEAT_OK" なら破棄、そうでなければ assistant message として
 *      currentSession に append (heartbeat: true 付き)
 *
 * tool_use loop は DeckAiColumn とほぼ同じだが、UI streaming 表示は省略
 * (応答完了後にメッセージ 1 つだけ追加)。`denyDuringHeartbeat` で指定された
 * capability は tool 一覧から除外する (= heartbeat 中の自動投稿暴走を防ぐ)。
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { onScopeDispose, type Ref } from 'vue'
import { dispatchCapability } from '@/capabilities/dispatcher'
import { listCapabilities } from '@/capabilities/registry'
import { toAnthropicTool, toOpenAiTool } from '@/capabilities/toolSchema'
import { useAccountsStore } from '@/stores/accounts'
import { useAiSessionsStore } from '@/stores/aiSessions'
import { useDeckStore } from '@/stores/deck'
import { useSkillsStore } from '@/stores/skills'
import { commands, unwrap } from '@/utils/tauriInvoke'
import { type ChatMessage, type ToolUseEvent, useAiChat } from './useAiChat'
import {
  type HeartbeatPresetKey,
  type ProviderKey,
  useAiConfig,
} from './useAiConfig'
import {
  buildAiContextBlock,
  buildHeartbeatContextBlock,
  composeHeartbeatSystemPrompt,
} from './useAiSystemContext'

/**
 * Rust scheduler (`commands/heartbeat.rs`) が `nd:ai-heartbeat-tick` event で
 * emit する payload と一致させる。specta は raw event payload を export しない
 * ので、こちら側で local 定義する (Rust 側の `HeartbeatTickPayload` と shape を
 * 合わせ続ける必要あり、変更時は両方更新)。
 */
export interface HeartbeatTickPayload {
  column_id: string
  triggered_at_ms: number
  source: string
}

/** AI 応答がこの文字列だけなら「報告すべき変化なし」として履歴に残さない。 */
export const HEARTBEAT_OK_TOKEN = 'HEARTBEAT_OK'

/**
 * AI 応答を「報告抑制すべきか」判定する純関数。
 * trim 後に `HEARTBEAT_OK_TOKEN` と完全一致 or 空文字なら true。
 * 部分一致 / 大小文字違いは false (= 表示する) にして false negative 寄りに。
 */
export function isHeartbeatOk(text: string | null | undefined): boolean {
  if (text == null) return true
  const trimmed = text.trim()
  return trimmed === HEARTBEAT_OK_TOKEN || trimmed.length === 0
}

const MAX_TOOL_ROUNDS = 5

/**
 * heartbeat 用の system prompt 末尾に必ず付ける指示文。
 * AI が "HEARTBEAT_OK" を返す条件を明示し、報告は簡潔に。
 */
const HEARTBEAT_INSTRUCTION = `
あなたは HEARTBEAT (定期チェック) として呼ばれています。
何も報告すべきことが無い場合は "${HEARTBEAT_OK_TOKEN}" の 1 行だけを返してください。
重要な発見がある場合のみ、200 字以内で簡潔にまとめて報告してください。
`.trim()

/** preset ごとの user prompt 断片。 */
const PRESET_PROMPTS: Record<HeartbeatPresetKey, string> = {
  unreadMentions:
    '未読通知を `notifications.list` で取得して、メンション・リプライ・引用 RN' +
    'の中で重要なものだけ抜粋して報告してください。それ以外 (リアクション通知' +
    ' 単独など) は無視して構いません。',
}

export interface UseHeartbeatRunnerOptions {
  /** このカラムの id (Rust から来る tick event とマッチング) */
  columnId: Ref<string>
  /**
   * tick を受けたときに append 先の session id。null なら append しない
   * (= 結果はログのみ)。
   */
  currentSessionId: Ref<string | null>
}

export function useHeartbeatRunner(opts: UseHeartbeatRunnerOptions) {
  const { config: aiConfig } = useAiConfig()
  const sessionsStore = useAiSessionsStore()
  const accountsStore = useAccountsStore()
  const skillsStore = useSkillsStore()
  const deckStore = useDeckStore()
  const aiChat = useAiChat()

  let unlisten: UnlistenFn | null = null
  /** 同時実行を防ぐ。前回 tick がまだ AI 応答中なら今回は skip。 */
  let running = false

  ;(async () => {
    unlisten = await listen<HeartbeatTickPayload>(
      'nd:ai-heartbeat-tick',
      (event) => {
        const payload = event.payload
        if (payload.column_id !== opts.columnId.value) return
        if (running) {
          console.debug(
            `[heartbeat] skip (already running) column=${opts.columnId.value}`,
          )
          return
        }
        running = true
        runHeartbeat(payload)
          .catch((e) => {
            console.warn('[heartbeat] runner error:', e)
          })
          .finally(() => {
            running = false
          })
      },
    )
  })()

  onScopeDispose(() => {
    if (unlisten) unlisten()
  })

  /**
   * 1 tick の本処理。cheap check → (AI inference → suppress) を順に実行。
   */
  async function runHeartbeat(payload: HeartbeatTickPayload): Promise<void> {
    const cfg = aiConfig.value.heartbeat
    if (!cfg.enabled) return
    if (cfg.presets.length === 0) return

    const accountId = accountsStore.activeAccountId
    if (!accountId) {
      console.debug('[heartbeat] no active account, skip')
      return
    }

    // Cheap check: preset 群のうち 1 つでも positive なら AI を起こす
    const cheapResults = await runCheapChecks(cfg.presets, accountId)
    const cheapTotal = Object.values(cheapResults).reduce(
      (sum, n) => sum + n,
      0,
    )
    if (cheapTotal === 0) {
      console.debug(
        `[heartbeat] cheap check 0, skip AI (column=${payload.column_id}, source=${payload.source})`,
      )
      return
    }

    // AI inference
    const responseText = await runAiInference(
      cfg.presets,
      cfg.denyDuringHeartbeat,
      cheapResults,
      payload,
    )
    if (responseText === null) return

    if (isHeartbeatOk(responseText)) {
      console.debug(
        `[heartbeat] AI returned OK / empty, suppress (column=${payload.column_id})`,
      )
      return
    }
    const trimmed = responseText.trim()

    // append assistant message to currentSession
    const sessionId = opts.currentSessionId.value
    if (!sessionId) {
      console.debug(
        `[heartbeat] no current session, log only: ${trimmed.slice(0, 80)}`,
      )
      return
    }
    const session = sessionsStore.get(sessionId)
    if (!session) return
    const ts = Date.now()
    const message: ChatMessage = {
      id: `msg-${ts}-hb`,
      role: 'assistant',
      content: trimmed,
      timestamp: ts,
      heartbeat: true,
    }
    sessionsStore.updateMessages(sessionId, [...session.messages, message])
  }

  /**
   * 各 preset の cheap check を並列実行し、preset id → hit 数の Record を返す。
   * cheap check は AI を呼ばない軽量判定 (= unread count などの 1 API call)。
   */
  async function runCheapChecks(
    presets: HeartbeatPresetKey[],
    accountId: string,
  ): Promise<Record<string, number>> {
    const pairs = await Promise.all(
      presets.map(
        async (p) => [p, await cheapCheckForPreset(p, accountId)] as const,
      ),
    )
    return Object.fromEntries(pairs)
  }

  /**
   * AI inference 本体。tool_use loop で最終 assistant text を返す。
   * UI streaming 表示は省略 (heartbeat は背景処理なので live 更新不要)。
   */
  async function runAiInference(
    presets: HeartbeatPresetKey[],
    denyList: string[],
    cheapResults: Record<string, number>,
    payload: HeartbeatTickPayload,
  ): Promise<string | null> {
    const provider: ProviderKey = aiConfig.value.provider
    const settings = aiConfig.value[provider]
    if (!settings.endpoint || !settings.model) {
      console.debug('[heartbeat] AI provider not configured, skip')
      return null
    }

    // 初期 user prompt は preset 別の指示を結合
    const userPromptBody = presets
      .map((p) => PRESET_PROMPTS[p])
      .filter(Boolean)
      .join('\n\n')
    const initialUser: ChatMessage = {
      id: `msg-${Date.now()}-hb-u`,
      role: 'user',
      content: userPromptBody,
      timestamp: Date.now(),
    }
    const history: ChatMessage[] = [initialUser]

    const denySet = new Set(denyList)
    const eligibleCaps = listCapabilities().filter(
      (c) => c.aiTool && c.signature && !denySet.has(c.id),
    )
    const tools: unknown[] | undefined =
      eligibleCaps.length === 0
        ? undefined
        : provider === 'anthropic'
          ? eligibleCaps.map(toAnthropicTool)
          : eligibleCaps.map(toOpenAiTool)

    // system prompt: skills + notedeck-context + heartbeat-context + instruction
    const skillsPrompt = skillsStore.composedSystemPrompt() || ''
    const focusedColumn = deckStore.getColumn(opts.columnId.value) ?? null
    const notedeckContext = buildAiContextBlock(aiConfig.value, {
      activeAccount: accountsStore.activeAccount,
      currentColumn: focusedColumn,
      accounts: accountsStore.accounts,
    })
    const heartbeatContext = buildHeartbeatContextBlock(
      cheapResults,
      new Date(payload.triggered_at_ms).toISOString(),
    )
    const system = composeHeartbeatSystemPrompt(
      skillsPrompt,
      notedeckContext,
      heartbeatContext,
      HEARTBEAT_INSTRUCTION,
    )

    let finalText = ''
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let pendingToolUse: ToolUseEvent | null = null
      const turnText = await aiChat.sendMessage({
        provider,
        endpoint: settings.endpoint,
        model: settings.model,
        history,
        system,
        tools,
        onToolUse: (e) => {
          pendingToolUse = e
        },
      })

      if (!pendingToolUse) {
        finalText = turnText
        break
      }
      const toolUse: ToolUseEvent = pendingToolUse
      const dispatch = await dispatchCapability(
        toolUse.name,
        toolUse.input,
        aiConfig.value,
      )
      const resultText = dispatch.ok
        ? typeof dispatch.result === 'string'
          ? dispatch.result
          : JSON.stringify(dispatch.result)
        : `Error (${dispatch.code}): ${dispatch.error}`
      const ts = Date.now()
      history.push({
        id: `msg-${ts}-hb-a${round}`,
        role: 'assistant',
        content: turnText,
        timestamp: ts,
        toolUseId: toolUse.toolUseId,
        toolUseName: toolUse.name,
        toolUseInput: toolUse.input,
      })
      history.push({
        id: `msg-${ts}-hb-r${round}`,
        role: 'user',
        content: resultText,
        timestamp: ts,
        toolResultFor: toolUse.toolUseId,
      })
    }

    return finalText
  }
}

/**
 * 各 preset の cheap check 実装。AI を呼ばない、単一 HTTP 呼び出しで
 * 「何かあるか」を 0/N で返す。
 *
 * - `unreadMentions` → `apiGetUnreadNotificationCount` (Misskey の i/notifications/unread)
 *   - 厳密にはメンション以外も含む unread count だが、HB-A1 では cheap = 全 unread。
 *   - `>0` なら AI を起こして notifications.list で詳細を取らせる。
 */
async function cheapCheckForPreset(
  preset: HeartbeatPresetKey,
  accountId: string,
): Promise<number> {
  switch (preset) {
    case 'unreadMentions': {
      try {
        const count = unwrap(
          await commands.apiGetUnreadNotificationCount(accountId),
        )
        return Number(count) || 0
      } catch (e) {
        console.warn('[heartbeat] cheap check (unreadMentions) failed:', e)
        return 0
      }
    }
    default:
      return 0
  }
}

/** test 用に export */
export const _internal = {
  HEARTBEAT_OK_TOKEN,
  HEARTBEAT_INSTRUCTION,
  PRESET_PROMPTS,
  cheapCheckForPreset,
}
