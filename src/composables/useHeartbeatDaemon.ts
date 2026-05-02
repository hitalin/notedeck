/**
 * HEARTBEAT (#411) — App-level global daemon.
 *
 * OpenClaw HEARTBEAT 仕様 (single scheduler / target routing) に揃えた
 * バックグラウンド実行エンジン。`useHeartbeatScheduler` (per-column) と
 * `useHeartbeatRunner` (per-column) の責務を 1 つに統合し、Tauri アプリ
 * 起動中に 1 つだけ動く singleton として App.vue で mount される。
 *
 * 流れ:
 *   1. `aiConfig.heartbeat.enabled / intervalMinutes` を watch して Rust
 *      scheduler に push (configure / unconfigure)
 *   2. `nd:ai-heartbeat-tick` を 1 度だけ listen (App-level)
 *   3. tick: heartbeat skill bodies + system prompt → AI inference
 *   4. OpenClaw 流 suppression (HEARTBEAT_OK / ackMaxChars)
 *   5. drop されなかった内容を target session に append
 *      - target='auto' (default): kind='heartbeat' の専用 session を auto-create
 *      - target='none'           : append しない (silent log)
 *      - target=<session id>     : 明示 pin
 *
 * 担当アカウント (`heartbeat.accountId`) は server-pulse 等のサーバー API を
 * どの account context で叩くか pin できる。null = 最初の active account。
 *
 * 並行実行ガード: `running` flag で同時実行 (= API call 暴発) を防ぐ。
 */

import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { dispatchCapability } from '@/capabilities/dispatcher'
import { listCapabilities } from '@/capabilities/registry'
import { toAnthropicTool, toOpenAiTool } from '@/capabilities/toolSchema'
import { useAccountsStore } from '@/stores/accounts'
import { type AiSession, useAiSessionsStore } from '@/stores/aiSessions'
import { useSkillsStore } from '@/stores/skills'
import { isTauri } from '@/utils/settingsFs'
import { commands, unwrap } from '@/utils/tauriInvoke'
import { type ChatMessage, type ToolUseEvent, useAiChat } from './useAiChat'
import {
  HEARTBEAT_ACK_MAX_CHARS,
  type HeartbeatTarget,
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
  if (body.startsWith(HEARTBEAT_OK_TOKEN)) {
    body = body.slice(HEARTBEAT_OK_TOKEN.length).trimStart()
  }
  if (body.endsWith(HEARTBEAT_OK_TOKEN)) {
    body = body.slice(0, body.length - HEARTBEAT_OK_TOKEN.length).trimEnd()
  }
  if (body.length === 0) return null
  if (
    body.length <= ackMaxChars &&
    body.includes(HEARTBEAT_OK_TOKEN) === false
  ) {
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

/**
 * target に従って出力先 session を解決する。`'auto'` の場合、kind='heartbeat'
 * の既存 session があれば再利用、なければ新規作成。`'none'` は null を返す。
 * 任意の session id 指定は実在しなければ null。
 */
async function resolveTargetSession(
  target: HeartbeatTarget,
  sessionsStore: ReturnType<typeof useAiSessionsStore>,
  defaultModel: string,
  defaultProvider: string,
): Promise<AiSession | null> {
  if (target === 'none') return null
  if (target === 'auto') {
    for (const sess of sessionsStore.sessions.values()) {
      if (sess.kind === 'heartbeat') return sess
    }
    return sessionsStore.createNew({
      kind: 'heartbeat',
      title: '💓 Heartbeat',
      model: defaultModel,
      provider: defaultProvider,
    })
  }
  return sessionsStore.get(target) ?? null
}

export function useHeartbeatDaemon() {
  const { config } = useAiConfig()
  const sessionsStore = useAiSessionsStore()
  const accountsStore = useAccountsStore()
  const skillsStore = useSkillsStore()
  const aiChat = useAiChat()

  const isRunning = ref(false)
  let unlisten: UnlistenFn | null = null

  // --- Rust scheduler 制御 ---

  async function configureScheduler(intervalMinutes: number): Promise<void> {
    if (!isTauri) return
    try {
      unwrap(await commands.heartbeatConfigure(intervalMinutes))
    } catch (e) {
      console.warn('[heartbeat] configure failed:', e)
    }
  }

  async function unconfigureScheduler(): Promise<void> {
    if (!isTauri) return
    try {
      unwrap(await commands.heartbeatUnconfigure())
    } catch (e) {
      console.warn('[heartbeat] unconfigure failed:', e)
    }
  }

  /** Manual trigger (= AI 設定の「💓 今すぐ実行」ボタン)。 */
  async function triggerNow(): Promise<void> {
    if (!isTauri) return
    try {
      unwrap(await commands.heartbeatTriggerNow())
    } catch (e) {
      console.warn('[heartbeat] trigger_now failed:', e)
    }
  }

  /**
   * 「Heartbeat session を開く」ボタン用。target='auto' なら専用 session を
   * find or create、target=<id> なら既存 session を返す、target='none' は null。
   *
   * UI は返ってきた session id をカラムの `aiCurrentSessionId` に流し込んで
   * jump する想定。
   */
  async function openHeartbeatSession(): Promise<string | null> {
    const provider: ProviderKey = config.value.provider
    const settings = config.value[provider]
    const target = await resolveTargetSession(
      config.value.heartbeat.target,
      sessionsStore,
      settings.model,
      provider,
    )
    return target?.id ?? null
  }

  watch(
    () => ({
      enabled: config.value.heartbeat.enabled,
      interval: config.value.heartbeat.intervalMinutes,
    }),
    async (next) => {
      if (next.enabled) {
        await configureScheduler(next.interval)
      } else {
        await unconfigureScheduler()
      }
    },
    { immediate: true, deep: true },
  )

  // --- tick listener (App lifecycle で 1 度だけ) ---
  ;(async () => {
    unlisten = await listen<HeartbeatTickPayload>(
      'nd:ai-heartbeat-tick',
      (event) => {
        if (isRunning.value) {
          console.debug(
            `[heartbeat] skip (already running) source=${event.payload.source}`,
          )
          return
        }
        isRunning.value = true
        runOnce(event.payload)
          .catch((e) => {
            console.warn('[heartbeat] daemon error:', e)
          })
          .finally(() => {
            isRunning.value = false
          })
      },
    )
  })()

  onScopeDispose(() => {
    if (unlisten) unlisten()
    void unconfigureScheduler()
  })

  // --- 1 tick 本処理 ---

  async function runOnce(payload: HeartbeatTickPayload): Promise<void> {
    const cfg = config.value.heartbeat
    if (!cfg.enabled) return

    // 担当アカウント解決: cfg.accountId 指定があればそれを使う、
    // なければ active account にフォールバック。どちらも無ければ skip。
    const accountId = cfg.accountId ?? accountsStore.activeAccountId ?? null
    if (!accountId) {
      console.debug('[heartbeat] no account resolved, skip')
      return
    }

    // heartbeat 対象 skill 取得
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

    // AI inference (capabilities が呼ばれた場合は AI が system prompt の
    // notedeck-context に書かれた accountHost / accountId を見て tool call
    // params に含めることで対象アカウントを指定する)
    const responseText = await runAiInference(
      skillBodies,
      cfg.denyDuringHeartbeat,
      payload,
      accountId,
    )
    if (responseText === null) return

    const visible = applyHeartbeatSuppression(responseText)
    if (visible === null) {
      console.debug(
        `[heartbeat] AI returned OK / short-ack, suppress (source=${payload.source})`,
      )
      return
    }

    // target session に append (target='none' なら log のみ)
    const provider: ProviderKey = config.value.provider
    const settings = config.value[provider]
    const target = await resolveTargetSession(
      cfg.target,
      sessionsStore,
      settings.model,
      provider,
    )
    if (!target) {
      console.debug(
        `[heartbeat] target='${cfg.target}' resolved to null, log only: ${visible.slice(0, 80)}`,
      )
      return
    }
    const ts = Date.now()
    const message: ChatMessage = {
      id: `msg-${ts}-hb`,
      role: 'assistant',
      content: visible,
      timestamp: ts,
      heartbeat: true,
    }
    sessionsStore.updateMessages(target.id, [...target.messages, message])
  }

  /**
   * AI inference 本体。tool_use loop で最終 assistant text を返す。
   * UI streaming 表示は省略 (heartbeat は背景処理なので live 更新不要)。
   */
  async function runAiInference(
    skillBodies: string[],
    denyList: string[],
    payload: HeartbeatTickPayload,
    accountId: string,
  ): Promise<string | null> {
    const provider: ProviderKey = config.value.provider
    const settings = config.value[provider]
    if (!settings.endpoint || !settings.model) {
      console.debug('[heartbeat] AI provider not configured, skip')
      return null
    }

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

    const targetAccount =
      accountsStore.accounts.find((a) => a.id === accountId) ??
      accountsStore.activeAccount
    const notedeckContext = buildAiContextBlock(config.value, {
      activeAccount: targetAccount,
      currentColumn: null,
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
        config.value,
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

  return {
    triggerNow,
    openHeartbeatSession,
    isRunning: computed(() => isRunning.value),
  }
}

/** test 用に export */
export const _internal = {
  HEARTBEAT_OK_TOKEN,
  HEARTBEAT_INSTRUCTION,
  resolveTargetSession,
}
