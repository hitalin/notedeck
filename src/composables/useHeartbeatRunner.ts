/**
 * HEARTBEAT (#411) — JS 側の runner (skill 駆動版)。
 *
 * OpenClaw の HEARTBEAT.md 仕様に倣い、ユーザーが `heartbeat.skills` で
 * 指定した skill (= NoteDeck の skills 体系で配布される markdown) の body を
 * そのまま AI に読ませて、何をするか / 何を報告するかを skill 側に委ねる。
 *
 * 流れ:
 *   1. このカラムの tick かフィルタ
 *   2. heartbeat.enabled / heartbeat.skills が空でないことを確認
 *   3. AI inference (skill bodies + heartbeat instruction を system prompt に注入)
 *   4. AI 応答を OpenClaw 流 suppression にかける
 *      - 先頭/末尾の HEARTBEAT_OK を trim
 *      - 残りが HEARTBEAT_ACK_MAX_CHARS 以下なら全体 drop
 *   5. drop されなかった内容を assistant message として currentSession に append
 *
 * `denyDuringHeartbeat` で指定された capability は tool 一覧から除外する
 * (= heartbeat 中の自動投稿暴走を防ぐ)。
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
import { type ChatMessage, type ToolUseEvent, useAiChat } from './useAiChat'
import {
  HEARTBEAT_ACK_MAX_CHARS,
  type ProviderKey,
  useAiConfig,
} from './useAiConfig'
import {
  buildAiContextBlock,
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

/** AI 応答が「何も報告すべきことがない」ことを示す sentinel token。 */
export const HEARTBEAT_OK_TOKEN = 'HEARTBEAT_OK'

/**
 * OpenClaw 流 suppression の純関数。
 *
 * - 先頭 / 末尾の `HEARTBEAT_OK` トークンを 1 つずつ剥がす (中間位置は触らない)
 * - 剥がした残り (trim 後) が 0 文字 or `ackMaxChars` 以下なら全体 null を返す
 *   (= 抑制 = 履歴に残さない)
 * - 上記に該当しなければ trim 済み残りを返す (= 表示する)
 *
 * @returns 表示すべきテキスト or null (= 抑制)
 */
export function applyHeartbeatSuppression(
  text: string | null | undefined,
  ackMaxChars: number = HEARTBEAT_ACK_MAX_CHARS,
): string | null {
  if (text == null) return null
  let body = text.trim()
  if (body.length === 0) return null
  // 先頭 HEARTBEAT_OK を 1 つだけ剥がす
  if (body.startsWith(HEARTBEAT_OK_TOKEN)) {
    body = body.slice(HEARTBEAT_OK_TOKEN.length).trimStart()
  }
  // 末尾 HEARTBEAT_OK を 1 つだけ剥がす
  if (body.endsWith(HEARTBEAT_OK_TOKEN)) {
    body = body.slice(0, body.length - HEARTBEAT_OK_TOKEN.length).trimEnd()
  }
  if (body.length === 0) return null
  if (
    body.length <= ackMaxChars &&
    body.includes(HEARTBEAT_OK_TOKEN) === false
  ) {
    // 残りが ack 閾値以下 = 「ほぼ OK の sniff だけ」と見なして丸ごと drop
    // (例: "OK / nothing urgent" のような短い ack)
    return null
  }
  return body
}

const MAX_TOOL_ROUNDS = 5

/**
 * heartbeat 用の system prompt 末尾に必ず付ける指示文。
 * OpenClaw の "Read HEARTBEAT.md if it exists. Follow it strictly." と同じ意図。
 */
const HEARTBEAT_INSTRUCTION = `
あなたは HEARTBEAT (定期チェック) として呼ばれています。
上に記載された HEARTBEAT skill の指示に厳密に従ってください。
過去の会話や前回の tick は参照しないでください。
何も報告すべきことが無い場合は "${HEARTBEAT_OK_TOKEN}" の 1 行だけを返してください。
重要な発見がある場合のみ、簡潔に (200 字以内推奨) まとめて報告してください。
`.trim()

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
   * 1 tick の本処理。heartbeat タグ付き skill 取得 → AI inference →
   * suppression → append。
   */
  async function runHeartbeat(payload: HeartbeatTickPayload): Promise<void> {
    const cfg = aiConfig.value.heartbeat
    if (!cfg.enabled) return

    if (!accountsStore.activeAccountId) {
      console.debug('[heartbeat] no active account, skip')
      return
    }

    // heartbeat 対象として宣言された skill 一覧を取得
    skillsStore.ensureLoaded()
    const heartbeatSkills = skillsStore.heartbeatSkills
    if (heartbeatSkills.length === 0) {
      console.debug('[heartbeat] no skills tagged as heartbeat, skip')
      return
    }
    const skillBodies: string[] = []
    for (const skill of heartbeatSkills) {
      const trimmed = skill.body.trim()
      if (trimmed.length === 0) continue
      skillBodies.push(`# Skill: ${skill.name}\n\n${trimmed}`)
    }
    if (skillBodies.length === 0) {
      console.debug('[heartbeat] heartbeat-tagged skills have empty body, skip')
      return
    }

    // AI inference
    const responseText = await runAiInference(
      skillBodies,
      cfg.denyDuringHeartbeat,
      payload,
    )
    if (responseText === null) return

    const visible = applyHeartbeatSuppression(responseText)
    if (visible === null) {
      console.debug(
        `[heartbeat] AI returned OK / short-ack, suppress (column=${payload.column_id})`,
      )
      return
    }

    // append assistant message to currentSession
    const sessionId = opts.currentSessionId.value
    if (!sessionId) {
      console.debug(
        `[heartbeat] no current session, log only: ${visible.slice(0, 80)}`,
      )
      return
    }
    const session = sessionsStore.get(sessionId)
    if (!session) return
    const ts = Date.now()
    const message: ChatMessage = {
      id: `msg-${ts}-hb`,
      role: 'assistant',
      content: visible,
      timestamp: ts,
      heartbeat: true,
    }
    sessionsStore.updateMessages(sessionId, [...session.messages, message])
  }

  /**
   * AI inference 本体。tool_use loop で最終 assistant text を返す。
   * UI streaming 表示は省略 (heartbeat は背景処理なので live 更新不要)。
   *
   * `skillBodies`: 選択 skill の body を結合済みの配列 (markdown)
   */
  async function runAiInference(
    skillBodies: string[],
    denyList: string[],
    payload: HeartbeatTickPayload,
  ): Promise<string | null> {
    const provider: ProviderKey = aiConfig.value.provider
    const settings = aiConfig.value[provider]
    if (!settings.endpoint || !settings.model) {
      console.debug('[heartbeat] AI provider not configured, skip')
      return null
    }

    // user 側の prompt は短い trigger メッセージのみ。本体の指示は system へ。
    const initialUser: ChatMessage = {
      id: `msg-${Date.now()}-hb-u`,
      role: 'user',
      content: `Heartbeat tick at ${new Date(payload.triggered_at_ms).toISOString()}`,
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

    // system prompt:
    //   skill bodies (heartbeat-context として連結) + notedeck-context + instruction
    // skills の通常 system prompt (composedSystemPrompt) は意図的に含めない:
    // OpenClaw の "Do not infer or repeat old tasks" 原則に従い、heartbeat は
    // 選択された skill のみを context として動く。
    const focusedColumn = deckStore.getColumn(opts.columnId.value) ?? null
    const notedeckContext = buildAiContextBlock(aiConfig.value, {
      activeAccount: accountsStore.activeAccount,
      currentColumn: focusedColumn,
      accounts: accountsStore.accounts,
    })
    const heartbeatContext = `<heartbeat-skills>\n${skillBodies.join('\n\n---\n\n')}\n</heartbeat-skills>`
    const system = composeHeartbeatSystemPrompt(
      '', // skills の always prompt は heartbeat 中は使わない
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

/** test 用に export */
export const _internal = {
  HEARTBEAT_OK_TOKEN,
  HEARTBEAT_INSTRUCTION,
}
