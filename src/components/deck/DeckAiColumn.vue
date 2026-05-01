<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import ColumnEmptyState from '@/components/common/ColumnEmptyState.vue'
import { type ChatMessage, useAiChat } from '@/composables/useAiChat'
import {
  getApiKeyStatus,
  type ProviderKey,
  useAiConfig,
  watchApiKeyChanges,
} from '@/composables/useAiConfig'
import { useAiConversation } from '@/composables/useAiConversation'
import {
  buildAiContextBlock,
  joinSystemPrompt,
  projectRecentConversation,
  projectVisibleNotes,
} from '@/composables/useAiSystemContext'
import { useAccountsStore } from '@/stores/accounts'
import { type AiSessionMeta, useAiSessionsStore } from '@/stores/aiSessions'
import { useConfirm } from '@/stores/confirm'
import {
  type DeckColumn,
  TIMELINE_LIKE_COLUMN_TYPES,
  useDeckStore,
} from '@/stores/deck'
import { usePrompt } from '@/stores/prompt'
import { useSkillsStore } from '@/stores/skills'
import { useToast } from '@/stores/toast'
import { timestampTitle } from '@/utils/aiSessionTitle'
import { renderSimpleMarkdown } from '@/utils/simpleMarkdown'
import DeckColumnComponent from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumn
}>()

const input = ref('')
// `ref="inputRef"` を template で利用しているが、現状 script からの read 利用は無し。
// 将来 focus 制御を再導入したくなった時のため shape は残しておく。
const _inputRef = useTemplateRef<HTMLTextAreaElement>('inputRef')
void _inputRef
const messagesEndRef = ref<HTMLElement | null>(null)
const providerStatus = ref<'connected' | 'disconnected' | 'checking'>(
  'checking',
)

const skillsStore = useSkillsStore()
skillsStore.ensureLoaded()

const sessionsStore = useAiSessionsStore()
const deckStore = useDeckStore()
const accountsStore = useAccountsStore()

void sessionsStore.loadAllMeta()

const { config: aiConfig } = useAiConfig()
const aiChat = useAiChat()
// 初回応答後にバックグラウンドでタイトルを AI 生成するための独立インスタンス。
// `aiChat` の isStreaming や activeStreamId と干渉しないよう別 composable 化。
const titleGen = useAiChat()

// `column.aiCurrentSessionId` を reactive に橋渡し。useAiConversation は
// この ref の変化を購読してメッセージ参照を切り替える。
const currentSessionId = computed(() => props.column.aiCurrentSessionId ?? null)

const conversation = useAiConversation(currentSessionId)
const messages = conversation.messages
const isGenerating = aiChat.isStreaming

// view mode は currentSessionId の有無で決まる:
// - sessions = アイコンの一覧 + 「新しいチャット」 (Misskey の DM 一覧と同じ役割)
// - chat = 選択中セッションのメッセージ + 入力欄
const viewMode = computed<'sessions' | 'chat'>(() =>
  currentSessionId.value ? 'chat' : 'sessions',
)

// --- セッション一覧グルーピング ---
interface SessionGroup {
  label: string
  items: AiSessionMeta[]
}

function startOfDay(dt: Date): number {
  const d = new Date(dt)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const groupedSessions = computed<SessionGroup[]>(() => {
  const sessions = sessionsStore.listSorted()
  const today = startOfDay(new Date())
  const yesterday = today - 24 * 60 * 60 * 1000
  const last7 = today - 7 * 24 * 60 * 60 * 1000

  const todayItems: AiSessionMeta[] = []
  const yesterdayItems: AiSessionMeta[] = []
  const lastWeekItems: AiSessionMeta[] = []
  const olderItems: AiSessionMeta[] = []

  for (const s of sessions) {
    if (s.updatedAt >= today) todayItems.push(s)
    else if (s.updatedAt >= yesterday) yesterdayItems.push(s)
    else if (s.updatedAt >= last7) lastWeekItems.push(s)
    else olderItems.push(s)
  }

  const groups: SessionGroup[] = []
  if (todayItems.length) groups.push({ label: '今日', items: todayItems })
  if (yesterdayItems.length)
    groups.push({ label: '昨日', items: yesterdayItems })
  if (lastWeekItems.length)
    groups.push({ label: '過去 7 日', items: lastWeekItems })
  if (olderItems.length) groups.push({ label: 'それ以前', items: olderItems })
  return groups
})

const totalSessions = computed(() => sessionsStore.listSorted().length)
const searchQuery = ref('')

const filteredGroupedSessions = computed<SessionGroup[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return groupedSessions.value
  return groupedSessions.value
    .map((g) => ({
      label: g.label,
      items: g.items.filter((s) =>
        (s.title || '無題のチャット').toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.items.length > 0)
})

const hasNoSearchHits = computed(
  () =>
    searchQuery.value.trim().length > 0 &&
    filteredGroupedSessions.value.length === 0,
)

function relativeTime(epoch: number): string {
  const diff = Date.now() - epoch
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'たった今'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 時間前`
  const d = new Date(epoch)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const currentSessionTitle = computed(() => {
  const id = currentSessionId.value
  if (!id) return null
  return sessionsStore.get(id)?.title || '無題のチャット'
})

const headerTitle = computed(() => {
  if (viewMode.value === 'chat' && currentSessionTitle.value) {
    return currentSessionTitle.value
  }
  return props.column.name || 'AIチャット'
})

// --- ナビゲーション ---

function openSession(sessionId: string): void {
  if (aiChat.isStreaming.value) {
    void aiChat.cancel()
  }
  deckStore.updateColumn(props.column.id, { aiCurrentSessionId: sessionId })
}

function backToSessions(): void {
  if (aiChat.isStreaming.value) {
    void aiChat.cancel()
  }
  deckStore.updateColumn(props.column.id, { aiCurrentSessionId: null })
  input.value = ''
}

// --- セッション操作 (rename / delete) ---

const { prompt } = usePrompt()
const { confirm } = useConfirm()
const toast = useToast()

async function onRenameSession(
  e: MouseEvent,
  sessionId: string,
): Promise<void> {
  e.preventDefault()
  e.stopPropagation()
  const cur = sessionsStore.get(sessionId)
  if (!cur) return
  const next = await prompt({
    title: 'セッション名を変更',
    defaultValue: cur.title,
    placeholder: 'セッション名',
  })
  if (next == null) return
  sessionsStore.setTitle(sessionId, next.trim())
  toast.show('セッション名を変更しました')
}

async function onDeleteSession(
  e: MouseEvent,
  sessionId: string,
): Promise<void> {
  e.preventDefault()
  e.stopPropagation()
  const cur = sessionsStore.get(sessionId)
  if (!cur) return
  const ok = await confirm({
    title: 'セッションを削除',
    message: `「${cur.title || '無題のチャット'}」を削除しますか？この操作は取り消せません。`,
    okLabel: '削除',
    type: 'danger',
  })
  if (!ok) return
  // 削除対象が現在開いているセッションなら一覧画面に戻す
  if (currentSessionId.value === sessionId) {
    if (aiChat.isStreaming.value) {
      void aiChat.cancel()
    }
    deckStore.updateColumn(props.column.id, { aiCurrentSessionId: null })
  }
  await sessionsStore.deleteSession(sessionId)
  toast.show('セッションを削除しました')
}

// --- プロバイダー接続チェック ---

async function checkProvider(): Promise<void> {
  providerStatus.value = 'checking'
  try {
    const provider: ProviderKey = aiConfig.value.provider
    const settings = aiConfig.value[provider]
    if (!settings.endpoint || !settings.model) {
      providerStatus.value = 'disconnected'
      return
    }
    if (provider === 'custom') {
      providerStatus.value = 'connected'
      return
    }
    const hasKey = await getApiKeyStatus(provider)
    providerStatus.value = hasKey ? 'connected' : 'disconnected'
  } catch {
    providerStatus.value = 'disconnected'
  }
}

watch(
  () => [
    aiConfig.value.provider,
    aiConfig.value[aiConfig.value.provider]?.endpoint,
    aiConfig.value[aiConfig.value.provider]?.model,
  ],
  () => {
    void checkProvider()
  },
  { immediate: true },
)

watch(watchApiKeyChanges(), () => {
  void checkProvider()
})

// --- スクロール ---

function scrollToBottom() {
  nextTick(() => {
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

watch(currentSessionId, () => {
  scrollToBottom()
})

// 進行中ストリームのセッション ID。currentSessionId の reactive 反映を
// 待たずに watch から直接 store を更新するために保持する。
const activeStreamSessionId = ref<string | null>(null)

// Stream deltas → update last assistant message in-place
watch(aiChat.currentText, (text) => {
  if (!aiChat.isStreaming.value || !text) return
  const sid = activeStreamSessionId.value
  if (!sid) return
  const cur = sessionsStore.get(sid)
  if (!cur) return
  const last = cur.messages[cur.messages.length - 1]
  if (last?.role !== 'assistant') return
  const updated = [...cur.messages.slice(0, -1), { ...last, content: text }]
  sessionsStore.updateMessages(sid, updated)
  scrollToBottom()
})

// --- 送信 ---

/**
 * 初回 round 完了後にバックグラウンドで AI にタイトルを生成させる。
 * - 会話 (user + assistant) を 1 つの user メッセージにまとめて送る。
 *   Anthropic は last message が assistant だと assistant 応答の続きとして
 *   扱うため、history には絶対に assistant role を置かない。
 * - 失敗は silent (best-effort)
 * - ユーザーが手動 rename したら上書きしない (titleBefore で race 対策)
 * - LLM 応答に余計な引用符や改行が混じる場合があるので軽く整形する
 */
const TITLE_SYSTEM_PROMPT =
  'あなたは会話セッションのタイトル生成アシスタントです。与えられた会話の内容を端的に表す短い日本語のタイトルを 1 行で出力してください。20 文字程度 (最大 40 文字) に収めること。引用符、前置き、改行、絵文字、文末句点は付けないでください。タイトルのみを返してください。'

async function generateAiTitleAsync(
  sessionId: string,
  userText: string,
  assistantText: string,
): Promise<void> {
  // 初期プレースホルダー (timestampTitle) は sendMessage 側で既にセット済み。
  // AI 生成に失敗した場合は何もせず、プレースホルダーがそのまま残る。
  if (providerStatus.value !== 'connected') return
  const before = sessionsStore.get(sessionId)
  if (!before) return
  const titleBefore = before.title
  const provider: ProviderKey = aiConfig.value.provider
  const settings = aiConfig.value[provider]
  if (!settings.endpoint || !settings.model) return

  // 会話を 1 つの user メッセージに集約する。assistant role を history に
  // 置くと Anthropic 側が「続きを書く」モードになりタイトルが取れない。
  const conversationPrompt =
    `次の会話に短いタイトルを付けてください。タイトルだけを 1 行で出力。\n\n` +
    `ユーザー:\n${userText}\n\nアシスタント:\n${assistantText}`

  try {
    const raw = await titleGen.sendMessage({
      provider,
      endpoint: settings.endpoint,
      model: settings.model,
      history: [
        { id: 'u', role: 'user', content: conversationPrompt, timestamp: 0 },
      ],
      system: TITLE_SYSTEM_PROMPT,
      maxTokens: 80,
    })
    const cleaned = raw
      .replace(/[\r\n]+/g, ' ')
      .replace(/^[\s「『"'“”]+|[\s」』"'“”。．、]+$/g, '')
      .trim()
      .slice(0, 40)
    if (!cleaned) return
    // ユーザーが間に手動 rename していたら触らない
    const cur = sessionsStore.get(sessionId)
    if (cur && cur.title === titleBefore) {
      sessionsStore.setTitle(sessionId, cleaned)
    }
  } catch (e) {
    console.warn('[ai-title-gen] failed:', e)
  }
}

/** 必要なら新規セッションを作って ID を返す。 */
function ensureSession(): string {
  if (currentSessionId.value) return currentSessionId.value
  const session = sessionsStore.createNew({
    model: aiConfig.value[aiConfig.value.provider]?.model ?? '',
    provider: aiConfig.value.provider,
  })
  deckStore.updateColumn(props.column.id, {
    aiCurrentSessionId: session.id,
  })
  return session.id
}

async function sendMessage() {
  const text = input.value.trim()
  if (!text || aiChat.isStreaming.value) return
  if (providerStatus.value !== 'connected') return

  // ensureSession の戻り値 (sessionId) を以降のすべての store 更新に直接使う。
  // currentSessionId は computed(props.column.aiCurrentSessionId) で、
  // updateColumn 直後の再評価タイミングに依存したくないため。
  const sessionId = ensureSession()

  const provider: ProviderKey = aiConfig.value.provider
  const settings = aiConfig.value[provider]

  const now = Date.now()
  const userMsg: ChatMessage = {
    id: `msg-${now}-u`,
    role: 'user',
    content: text,
    timestamp: now,
  }

  const before = sessionsStore.get(sessionId)
  if (!before) return
  sessionsStore.updateMessages(sessionId, [...before.messages, userMsg])
  input.value = ''
  scrollToBottom()

  // この round が assistant 応答のない初回かどうかを記録 (AI 生成タイトル用)。
  const wasFirstRound = !before.messages.some((m) => m.role === 'assistant')

  // 初期プレースホルダーは Zettelkasten 形式の日時タイトル。
  // 初回応答完了後に AI 生成タイトルが届けば上書きされる (失敗時は残る)。
  if (!before.title) {
    sessionsStore.setTitle(sessionId, timestampTitle(new Date(now)))
  }

  // Pre-add empty assistant placeholder so streaming has a target slot
  const assistantMsg: ChatMessage = {
    id: `msg-${now}-a`,
    role: 'assistant',
    content: '',
    timestamp: now,
  }
  const afterUser = sessionsStore.get(sessionId)
  if (!afterUser) return
  sessionsStore.updateMessages(sessionId, [...afterUser.messages, assistantMsg])
  scrollToBottom()

  activeStreamSessionId.value = sessionId

  // Build wire history: exclude the empty placeholder, exclude any system msgs
  const history = (sessionsStore.get(sessionId)?.messages ?? []).filter(
    (m) => m.role !== 'system' && m.id !== assistantMsg.id,
  )

  const skillsPrompt = skillsStore.composedSystemPrompt() || ''
  // ユーザーが Timeline をクリックしていないケースに備えて、fallback として
  // 画面上に存在する最初の TIMELINE_LIKE カラムを使う。
  const focusedColumnId =
    deckStore.lastFocusedTimelineColumnId ??
    deckStore.columns.find((c) => TIMELINE_LIKE_COLUMN_TYPES.has(c.type))?.id ??
    null
  const focusedColumn = focusedColumnId
    ? deckStore.getColumn(focusedColumnId)
    : null
  const visibleNotesRaw = focusedColumnId
    ? deckStore.visibleNotesByColumn[focusedColumnId]
    : undefined
  const contextBlock = buildAiContextBlock(aiConfig.value, {
    activeAccount: accountsStore.activeAccount,
    currentColumn: focusedColumn ?? props.column,
    visibleNotes: projectVisibleNotes(visibleNotesRaw),
    recentConversation: projectRecentConversation(history),
  })
  const system = joinSystemPrompt(skillsPrompt, contextBlock)

  try {
    const finalText = await aiChat.sendMessage({
      provider,
      endpoint: settings.endpoint,
      model: settings.model,
      history,
      system,
    })
    const cur = sessionsStore.get(sessionId)
    if (cur) {
      const last = cur.messages[cur.messages.length - 1]
      if (last?.role === 'assistant' && last.content !== finalText) {
        sessionsStore.updateMessages(sessionId, [
          ...cur.messages.slice(0, -1),
          { ...last, content: finalText },
        ])
      }
    }
    // 初回 round 完了後にバックグラウンドで AI にタイトルを再生成させる
    if (wasFirstRound && finalText) {
      void generateAiTitleAsync(sessionId, text, finalText)
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const cur = sessionsStore.get(sessionId)
    if (cur) {
      const last = cur.messages[cur.messages.length - 1]
      if (last?.role === 'assistant') {
        sessionsStore.updateMessages(sessionId, [
          ...cur.messages.slice(0, -1),
          { ...last, content: `⚠️ ${message}` },
        ])
      }
    }
  }
  activeStreamSessionId.value = null
  scrollToBottom()
}

// --- コピー ---

const copiedMessageId = ref<string | null>(null)

async function copyMessage(msg: ChatMessage) {
  try {
    await navigator.clipboard.writeText(msg.content)
    copiedMessageId.value = msg.id
    setTimeout(() => {
      if (copiedMessageId.value === msg.id) copiedMessageId.value = null
    }, 1500)
  } catch (e) {
    console.warn('[ai-chat] copy failed:', e)
  }
}

function renderAssistant(content: string): string {
  return renderSimpleMarkdown(content)
}

function onAssistantContentClick(e: MouseEvent) {
  const target = e.target
  if (!(target instanceof HTMLElement)) return
  const btn = target.closest('button[data-md-copy]')
  if (!(btn instanceof HTMLButtonElement)) return
  const pre = btn.closest('pre')
  const code = pre?.querySelector('code')
  if (!code) return
  const text = code.textContent ?? ''
  navigator.clipboard
    .writeText(text)
    .then(() => {
      const original = btn.textContent
      btn.textContent = 'コピー済み'
      window.setTimeout(() => {
        btn.textContent = original
      }, 1500)
    })
    .catch((err) => {
      console.warn('[ai-chat] code copy failed:', err)
    })
}

// 入力欄の自動高さ調整は textarea の `field-sizing: content` (CSS) に委ねる。

const aiMessagesRef = useTemplateRef<HTMLElement>('aiMessagesRef')
const sessionsListRef = useTemplateRef<HTMLElement>('sessionsListRef')

function scrollToTop() {
  if (viewMode.value === 'chat') {
    aiMessagesRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    sessionsListRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <DeckColumnComponent
    :column-id="column.id"
    :title="headerTitle"
    @header-click="scrollToTop"
  >
    <template #header-icon>
      <i class="ti ti-brain" />
    </template>

    <template v-if="viewMode === 'chat'" #header-meta>
      <button
        class="_button"
        :class="$style.headerAction"
        title="セッション一覧へ戻る"
        @click="backToSessions"
      >
        <i class="ti ti-arrow-left" />
      </button>
    </template>

    <template v-if="viewMode === 'sessions'" #header-extra>
      <div :class="$style.searchBar">
        <i :class="$style.searchIcon" class="ti ti-search" />
        <input
          v-model="searchQuery"
          :class="$style.searchInput"
          type="text"
          placeholder="セッションを検索..."
        />
      </div>
    </template>

    <!-- View: sessions list (master) -->
    <div v-if="viewMode === 'sessions'" :class="$style.sessionsBody">
      <ColumnEmptyState
        v-if="totalSessions === 0"
        message="セッションはまだありません"
        fallback-kind="info"
      />
      <ColumnEmptyState
        v-else-if="hasNoSearchHits"
        message="一致するセッションがありません"
        fallback-kind="info"
      />
      <div v-else ref="sessionsListRef" :class="$style.sessionsList">
        <div
          v-for="group in filteredGroupedSessions"
          :key="group.label"
          :class="$style.group"
        >
          <div :class="$style.groupLabel">{{ group.label }}</div>
          <div
            v-for="session in group.items"
            :key="session.id"
            :class="[
              $style.row,
              {
                [$style.rowActive]: session.id === currentSessionId,
              },
            ]"
            role="button"
            tabindex="0"
            @click="openSession(session.id)"
            @keydown.enter="openSession(session.id)"
          >
            <div :class="$style.rowMain">
              <span :class="$style.rowTitle">
                {{ session.title || '無題のチャット' }}
              </span>
              <span :class="$style.rowMeta">
                {{ relativeTime(session.updatedAt) }}
              </span>
            </div>
            <div :class="$style.rowActions">
              <button
                class="_button"
                :class="$style.rowActionBtn"
                title="名前を変更"
                @click="onRenameSession($event, session.id)"
              >
                <i class="ti ti-pencil" />
              </button>
              <button
                class="_button"
                :class="[$style.rowActionBtn, $style.rowActionBtnDanger]"
                title="削除"
                @click="onDeleteSession($event, session.id)"
              >
                <i class="ti ti-trash" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick-start input: 一覧から直接送信すると新規セッション自動生成 -->
      <div :class="$style.chatInput">
        <div :class="$style.chatInputRow">
          <textarea
            ref="inputRef"
            v-model="input"
            :class="$style.chatTextarea"
            :placeholder="providerStatus === 'connected'
              ? '質問してみましょう'
              : 'AI 設定で API キーを設定してください'"
            rows="1"
            :disabled="providerStatus !== 'connected'"
            @keydown="onKeydown"
          />
          <button
            :class="$style.chatSend"
            :disabled="!input.trim() || providerStatus !== 'connected'"
            @click="sendMessage"
          >
            <i class="ti ti-send" />
          </button>
        </div>
      </div>
    </div>

    <!-- View: chat (detail) -->
    <div v-else :class="$style.aiColumnBody">
      <ColumnEmptyState
        v-if="messages.length === 0"
        :message="providerStatus === 'connected'
          ? '質問してみましょう'
          : 'AI 設定で API キーを設定してください'"
        :is-error="providerStatus === 'disconnected'"
        :fallback-kind="providerStatus === 'connected' ? 'info' : 'error'"
      />

      <div v-else ref="aiMessagesRef" :class="$style.aiMessages">
        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="[$style.chatMsg, { [$style.mine]: msg.role === 'user' }]"
        >
          <div :class="$style.chatBubbleWrapper">
            <div :class="$style.chatBubble">
              <div
                v-if="msg.role === 'assistant' && !msg.content && isGenerating"
                :class="$style.messageTyping"
              >
                <span :class="$style.typingDot" />
                <span :class="$style.typingDot" />
                <span :class="$style.typingDot" />
              </div>
              <div
                v-else-if="msg.role === 'assistant'"
                :class="$style.markdownContent"
                v-html="renderAssistant(msg.content)"
                @click="onAssistantContentClick"
              />
              <div v-else :class="$style.chatText">{{ msg.content }}</div>
            </div>
            <button
              v-if="msg.role === 'assistant' && msg.content && !isGenerating"
              class="_button"
              :class="$style.copyBtn"
              :title="copiedMessageId === msg.id ? 'コピーしました' : 'コピー'"
              @click="copyMessage(msg)"
            >
              <i :class="copiedMessageId === msg.id ? 'ti ti-check' : 'ti ti-copy'" />
            </button>
          </div>
        </div>

        <div ref="messagesEndRef" />
      </div>

      <div :class="$style.chatInput">
        <div :class="$style.chatInputRow">
          <textarea
            ref="inputRef"
            v-model="input"
            :class="$style.chatTextarea"
            :placeholder="providerStatus === 'connected'
              ? '質問してみましょう'
              : 'AI 設定で API キーを設定してください'"
            rows="1"
            :disabled="providerStatus !== 'connected'"
            @keydown="onKeydown"
          />
          <button
            v-if="isGenerating"
            :class="[$style.chatSend, $style.chatStop]"
            title="停止"
            @click="aiChat.cancel()"
          >
            <i class="ti ti-player-stop" />
          </button>
          <button
            v-else
            :class="$style.chatSend"
            :disabled="!input.trim() || providerStatus !== 'connected'"
            title="送信"
            @click="sendMessage"
          >
            <i class="ti ti-send" />
          </button>
        </div>
      </div>
    </div>

  </DeckColumnComponent>
</template>

<style lang="scss" module>
.headerAction {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 4px;
  border-radius: var(--nd-radius-sm);
  opacity: 0.45;
  font-size: 0.9em;
  flex-shrink: 0;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}

// --- セッション一覧ビュー ---

.searchBar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-bg);
}

.searchIcon {
  flex-shrink: 0;
  opacity: 0.4;
}

.searchInput {
  flex: 1;
  min-width: 0;
  background: var(--nd-buttonBg);
  border: none;
  border-radius: var(--nd-radius-sm);
  padding: 6px 10px;
  font-size: 0.85em;
  color: var(--nd-fg);
  outline: none;

  &:focus {
    box-shadow: 0 0 0 2px var(--nd-accent);
  }

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.4;
  }
}

.sessionsBody {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.sessionsList {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 0;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.group {
  padding: 4px 0;
}

.groupLabel {
  padding: 6px 12px 4px;
  font-size: 0.7em;
  font-weight: 700;
  opacity: 0.5;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  transition: background var(--nd-duration-base);

  &:hover,
  &:focus-visible {
    background: var(--nd-buttonHoverBg);

    .rowActions {
      opacity: 1;
    }
  }
}

.rowActive {
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);

  &:hover {
    background: color-mix(in srgb, var(--nd-accent) 22%, transparent);
  }
}

.rowMain {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rowTitle {
  font-size: 0.9em;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rowMeta {
  font-size: 0.75em;
  opacity: 0.55;
}

// スキルカラムの行アクションと同じパターン: hover で出現するインラインボタン群。
.rowActions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;

  // タッチ環境では常時表示（hover が無いため）
  @media (hover: none) {
    opacity: 1;
  }
}

.rowActionBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 4px;
  color: var(--nd-fg);
  font-size: 0.95em;
  opacity: 0.7;
  transition: background 0.1s, opacity 0.1s, color 0.1s;

  &:hover {
    opacity: 1;
    background: var(--nd-overlay);
  }
}

// 危険操作（削除）— hover で赤くする。`--nd-love` / `--nd-love-hover` は
// global.css で定義されたシステムカラー。
.rowActionBtnDanger:hover {
  color: var(--nd-love);
  background: var(--nd-love-hover);
}

// --- チャットビュー (旧来) ---

.aiColumnBody {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.aiMessages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 0;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

// MkChatMessage.vue (DM チャット) のバブルレイアウトに揃える。
.chatMsg {
  display: flex;
  align-items: flex-start;
  padding: 4px 12px;

  &.mine {
    flex-direction: row-reverse;

    .chatBubble {
      background: var(--nd-accentedBg, rgba(134, 179, 0, 0.15));
      border-bottom-right-radius: 4px;
    }
  }

  &:not(.mine) .chatBubble {
    border-bottom-left-radius: 4px;
  }
}

.chatBubbleWrapper {
  max-width: 85%;
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 4px;

  &:hover .copyBtn {
    opacity: 0.5;
  }
}

.chatBubble {
  padding: 8px 12px;
  border-radius: 14px;
  background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.05));
  font-size: 0.95em;
  line-height: 1.5;
  word-break: break-word;
  min-width: 0;
}

.chatText {
  white-space: pre-wrap;
}

.copyBtn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--nd-radius-sm);
  opacity: 0;
  font-size: 0.85em;
  transition: opacity var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1 !important;
  }
}

.markdownContent {
  white-space: normal;

  :global(p) {
    margin: 0;
  }
  :global(p + p) {
    margin-top: 0.4em;
  }
  :global(pre) {
    position: relative;
    margin: 0.5em 0;
    padding: 8px 10px;
    padding-right: 28px;
    background: var(--nd-base);
    border-radius: var(--nd-radius-sm);
    overflow-x: auto;
    font-size: 0.85em;
  }
  :global(pre code) {
    font-family: var(--nd-font-mono, monospace);
  }
  :global(pre button[data-md-copy]) {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 22px;
    height: 22px;
    border: none;
    background: transparent;
    color: inherit;
    opacity: 0.3;
    border-radius: var(--nd-radius-sm);
    cursor: pointer;
    font-size: 0.7em;
  }
  :global(pre:hover button[data-md-copy]) {
    opacity: 0.7;
  }
  :global(pre button[data-md-copy]:hover) {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
  :global(code) {
    font-family: var(--nd-font-mono, monospace);
    background: var(--nd-base);
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.85em;
  }
  :global(pre code) {
    background: transparent;
    padding: 0;
  }
  :global(ul),
  :global(ol) {
    margin: 0.4em 0;
    padding-left: 1.4em;
  }
  :global(li) {
    margin: 0.15em 0;
  }
  :global(strong) {
    font-weight: 700;
  }
  :global(em) {
    font-style: italic;
  }
  :global(a) {
    color: var(--nd-accent);
    text-decoration: underline;
  }
}

.messageTyping {
  display: flex;
  gap: 4px;
  padding: 10px 12px;
  background: var(--nd-buttonBg);
  border-radius: var(--nd-radius);
}

.typingDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.4;
  animation: typing 1.4s infinite;
}
.typingDot:nth-child(2) {
  animation-delay: 0.2s;
}
.typingDot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

// Chat カラム (DeckChatColumn.vue) の入力欄スタイルに揃える。
.chatInput {
  display: flex;
  flex-direction: column;
  padding: 6px 8px 8px;
  border-top: 1px solid var(--nd-divider, rgba(255, 255, 255, 0.05));
  background: var(--nd-panel);
  position: relative;
  flex-shrink: 0;
}

.chatInputRow {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.chatTextarea {
  flex: 1;
  resize: none;
  border: none;
  background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.05));
  color: var(--nd-fg);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 0.9em;
  font-family: inherit;
  line-height: 1.4;
  max-height: 120px;
  outline: none;
  field-sizing: content;

  &::placeholder {
    opacity: 0.4;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.chatSend {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 1em;
  transition: filter var(--nd-duration-base);

  &:disabled {
    opacity: 0.3;
    cursor: default;
  }

  &:not(:disabled):hover {
    filter: brightness(1.1);
  }
}
</style>
