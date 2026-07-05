import { type Ref, ref, watch } from 'vue'
import type { DispatchResult } from '@/capabilities/dispatcher'
import type {
  AiChatSendOptions,
  ChatMessage,
  ToolUseEvent,
} from '@/composables/useAiChat'
import { extractErrorMessage } from '@/utils/errors'

/**
 * AI 送信ターンの状態機械 (#707)。DeckAiColumn から抽出した send ループ本体:
 * user + placeholder の session 追加 → tool round 反復 (dispatch / session 確定)
 * → 最終テキスト書き戻し / エラー時 partial 温存 (#508) / retryContext (#646)。
 *
 * 依存は port として注入する。view (scroll / タイトル生成 / context 組み立て)
 * は呼び出し側の責務。
 */

/** streaming chat の必要最小面 (useAiChat の部分型) */
export interface AiSendChatPort {
  isStreaming: Ref<boolean>
  currentText: Ref<string>
  sendMessage(opts: AiChatSendOptions): Promise<string>
}

/** session store の必要最小面 (useAiSessionsStore の部分型) */
export interface AiSendSessionPort {
  get(id: string): { title: string; messages: ChatMessage[] } | undefined
  updateMessages(id: string, messages: ChatMessage[]): void
}

export interface AiSendLoopDeps {
  chat: AiSendChatPort
  sessions: AiSendSessionPort
  /** capability dispatch (principal は呼び出し側で固定する) */
  dispatch(
    name: string,
    input: Record<string, unknown>,
  ): Promise<DispatchResult>
  /**
   * tool 実行直前の設定・権限再読込 (外部エディタでの変更を再起動なしで反映)。
   * 失敗しても既存 cache で続行する。
   */
  reloadConfigs?(): Promise<void>
  /** session 更新のたびに呼ばれる view hook (scroll 等) */
  onUpdate?(): void
}

export interface AiSendRequest {
  sessionId: string
  /** ユーザー入力テキスト (user メッセージとして追加される) */
  text: string
  connectionId: string
  model: string
  /** provider 形式に変換済みの tool definition 配列 */
  tools?: unknown[]
  /**
   * round ごとに wire history から system prompt を組み立てる。
   * context (memos / visible notes 等) は round 間で変わりうるため毎回呼ぶ。
   * undefined は「system prompt なし」(useAiChat 側の system?: string と同じ)。
   */
  buildSystem(
    history: ChatMessage[],
  ): Promise<string | undefined> | string | undefined
}

export type AiSendOutcome =
  | { status: 'done'; finalText: string; wasFirstRound: boolean }
  | { status: 'error'; message: string; wasFirstRound: boolean }
  /** session 消失等で何も送らなかった */
  | { status: 'aborted' }

/**
 * ストリーム切断 (#508) で失敗したターンの再試行用コンテキスト。
 * tool を 1 つでも実行したターンは再送で write capability が二重実行される
 * 恐れがあるため記録しない (#646 §C)。
 */
export interface AiRetryContext {
  sessionId: string
  userMsgId: string
  placeholderId: string
  userText: string
}

/**
 * tool_use ループで暴走しないための上限。1 ターン中に AI が連続で tool を
 * 呼び続けるケースを抑える (普通は 1〜2 回で止まる)。
 */
export const MAX_TOOL_ROUNDS = 5

export function useAiSendLoop(deps: AiSendLoopDeps) {
  // 進行中ストリームのセッション ID。カラム側の currentSessionId の reactive
  // 反映を待たずに delta watcher から直接 store を更新するために保持する。
  const activeStreamSessionId = ref<string | null>(null)

  const retryContext = ref<AiRetryContext | null>(null)

  // Stream deltas → update last assistant message in-place
  watch(deps.chat.currentText, (text) => {
    if (!deps.chat.isStreaming.value || !text) return
    const sid = activeStreamSessionId.value
    if (!sid) return
    const cur = deps.sessions.get(sid)
    if (!cur) return
    const last = cur.messages[cur.messages.length - 1]
    if (last?.role !== 'assistant') return
    deps.sessions.updateMessages(sid, [
      ...cur.messages.slice(0, -1),
      { ...last, content: text },
    ])
    deps.onUpdate?.()
  })

  async function runSend(req: AiSendRequest): Promise<AiSendOutcome> {
    retryContext.value = null

    const now = Date.now()
    const userMsg: ChatMessage = {
      id: `msg-${now}-u`,
      role: 'user',
      content: req.text,
      timestamp: now,
    }
    const before = deps.sessions.get(req.sessionId)
    if (!before) return { status: 'aborted' }
    deps.sessions.updateMessages(req.sessionId, [...before.messages, userMsg])
    deps.onUpdate?.()

    // この round が assistant 応答のない初回かどうか (AI 生成タイトル用)
    const wasFirstRound = !before.messages.some((m) => m.role === 'assistant')

    // Pre-add empty assistant placeholder so streaming has a target slot
    const assistantMsg: ChatMessage = {
      id: `msg-${now}-a`,
      role: 'assistant',
      content: '',
      timestamp: now,
    }
    const afterUser = deps.sessions.get(req.sessionId)
    if (!afterUser) return { status: 'aborted' }
    deps.sessions.updateMessages(req.sessionId, [
      ...afterUser.messages,
      assistantMsg,
    ])
    deps.onUpdate?.()

    activeStreamSessionId.value = req.sessionId

    let toolRound = 0
    let placeholderId = assistantMsg.id
    let finalAssistantText = ''

    try {
      while (true) {
        // 現セッションから wire history を組み立て (placeholder のみ除外)。
        // system role の中間メッセージは入らない設計だが、念のため除外する。
        const history = (
          deps.sessions.get(req.sessionId)?.messages ?? []
        ).filter(
          (m) =>
            m.role !== 'system' &&
            m.id !== placeholderId &&
            // heartbeat 由来 message は AI history から除外 (#411)
            // ユーザーは見えるが AI には見せない (= 文脈を汚さない)
            !m.heartbeat,
        )

        const system = await req.buildSystem(history)

        let pendingToolUse: ToolUseEvent | null = null
        const turnText = await deps.chat.sendMessage({
          connectionId: req.connectionId,
          model: req.model,
          history,
          system,
          tools: req.tools,
          onToolUse: (e) => {
            pendingToolUse = e
          },
        })

        if (turnText) finalAssistantText = turnText

        if (!pendingToolUse) break

        if (toolRound >= MAX_TOOL_ROUNDS) {
          finalAssistantText =
            (turnText || finalAssistantText) +
            `\n\n⚠️ tool 呼び出しが上限 (${MAX_TOOL_ROUNDS} 回) に達しました。`
          break
        }
        toolRound++

        // pendingToolUse を非 null として明示 (TS narrowing)
        const toolUse: ToolUseEvent = pendingToolUse

        try {
          await deps.reloadConfigs?.()
        } catch (e) {
          console.warn(
            '[ai-send-loop] config reload before dispatch failed:',
            e,
          )
        }

        // capability dispatch (permissions チェック込み)
        const dispatch = await deps.dispatch(toolUse.name, toolUse.input)
        const resultText = dispatch.ok
          ? typeof dispatch.result === 'string'
            ? dispatch.result
            : JSON.stringify(dispatch.result)
          : `Error (${dispatch.code}): ${dispatch.error}`

        // session 更新: placeholder を「中間テキスト + tool_use」として確定し、
        // tool_result + 新しい placeholder を追加する。
        const cur = deps.sessions.get(req.sessionId)
        if (!cur) break
        const ts = Date.now()
        const messagesWithoutPlaceholder = cur.messages.filter(
          (m) => m.id !== placeholderId,
        )
        const assistantWithToolUse: ChatMessage = {
          id: placeholderId,
          role: 'assistant',
          content: turnText,
          timestamp: ts,
          toolUseId: toolUse.toolUseId,
          toolUseName: toolUse.name,
          toolUseInput: toolUse.input,
        }
        const toolResultMsg: ChatMessage = {
          id: `msg-${ts}-r${toolRound}`,
          role: 'user',
          content: resultText,
          timestamp: ts,
          toolResultFor: toolUse.toolUseId,
        }
        const nextPlaceholderId = `msg-${ts}-a${toolRound}`
        const nextAssistant: ChatMessage = {
          id: nextPlaceholderId,
          role: 'assistant',
          content: '',
          timestamp: ts,
        }
        deps.sessions.updateMessages(req.sessionId, [
          ...messagesWithoutPlaceholder,
          assistantWithToolUse,
          toolResultMsg,
          nextAssistant,
        ])
        placeholderId = nextPlaceholderId
        deps.onUpdate?.()
      }

      // 最終 assistant テキストを placeholder に書き戻す。
      const cur = deps.sessions.get(req.sessionId)
      if (cur) {
        const last = cur.messages[cur.messages.length - 1]
        if (
          last?.role === 'assistant' &&
          last.id === placeholderId &&
          last.content !== finalAssistantText
        ) {
          deps.sessions.updateMessages(req.sessionId, [
            ...cur.messages.slice(0, -1),
            { ...last, content: finalAssistantText },
          ])
        }
      }
      return { status: 'done', finalText: finalAssistantText, wasFirstRound }
    } catch (e) {
      // 診断: AI ストリーム失敗時の raw error を console に dump。
      // [object Object] 表示の根本原因 (= 想定外の error shape) を追跡しやすくする。
      console.error('[ai-send-loop] stream error raw:', e)
      const message = extractErrorMessage(e)
      const cur = deps.sessions.get(req.sessionId)
      if (cur) {
        const last = cur.messages[cur.messages.length - 1]
        if (last?.role === 'assistant' && last.id === placeholderId) {
          // mid-stream 切断 (#508) では placeholder に途中までの応答が入っている。
          // 上書きで捨てず、末尾にエラーを添えて温存する。エラーと同じ flush
          // ウィンドウに届いた最終 delta は store 反映前のことがあるため、
          // currentText と store の長い方を採る。
          const partial =
            deps.chat.currentText.value.length > last.content.length
              ? deps.chat.currentText.value
              : last.content
          deps.sessions.updateMessages(req.sessionId, [
            ...cur.messages.slice(0, -1),
            {
              ...last,
              content: partial ? `${partial}\n\n⚠️ ${message}` : `⚠️ ${message}`,
            },
          ])
        }
      }
      // tool 未実行のターンだけ再試行を許可する (#508)。tool 実行後の再送は
      // write capability (投稿/クリップ等) の二重実行につながるため出さない。
      if (toolRound === 0) {
        retryContext.value = {
          sessionId: req.sessionId,
          userMsgId: userMsg.id,
          placeholderId,
          userText: req.text,
        }
      }
      return { status: 'error', message, wasFirstRound }
    } finally {
      activeStreamSessionId.value = null
      deps.onUpdate?.()
    }
  }

  /**
   * 再試行の準備: 失敗した user + assistant のペアを session から取り除き、
   * 再送すべき userText を返す。history が失敗前と同一になるので、呼び出し側は
   * 通常の送信経路を再走行するだけでよい。実行できない状況 (別セッション表示中 /
   * streaming 中 / コンテキスト無し) では null を返し、状態を変えない。
   */
  function prepareRetry(currentSessionId: string | null): string | null {
    const r = retryContext.value
    if (!r || deps.chat.isStreaming.value) return null
    if (r.sessionId !== currentSessionId) return null
    retryContext.value = null
    const cur = deps.sessions.get(r.sessionId)
    if (!cur) return null
    deps.sessions.updateMessages(
      r.sessionId,
      cur.messages.filter(
        (m) => m.id !== r.userMsgId && m.id !== r.placeholderId,
      ),
    )
    return r.userText
  }

  return {
    runSend,
    prepareRetry,
    retryContext,
  }
}
