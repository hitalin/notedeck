/**
 * useAiSessionsStore — AI セッション (`sessions/<id>.json5`) の集中管理。
 *
 * - **メタは全件常駐**: 数百件規模なら最大数 MB なので問題なし
 * - **本文 (messages) は遅延ロード**: セッション切替時に必要なものだけ
 * - **永続化は sessionId 単位 debounce**: 複数カラムから同じセッションを開いても
 *   ファイル書込は 1 ファイルに集約される
 * - **id (= ファイル名 stem) と内部 id は完全一致**: ファイル単体で自己同定可能
 *
 * カラム側からは `useAiConversation(sessionId)` 経由でアクセスし、本ストアの
 * リアクティブ参照と同期する（本ストアは単一の真の source）。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChatMessage } from '@/composables/useAiChat'
import type {
  AiSession,
  AiSessionKind,
  AiSessionMeta,
} from '@/services/aiSessionCodec'
import {
  CURRENT_SCHEMA_VERSION,
  deserialize,
  serialize,
} from '@/services/aiSessionCodec'
import { generateSessionId } from '@/utils/aiSessionId'
import { createKeyedDebouncedPersist } from '@/utils/debouncedPersist'
import {
  aiSessionFilename,
  deleteAiSessionFile,
  isTauri,
  listAiSessionFiles,
  readAiSessionFile,
  writeAiSessionFile,
} from '@/utils/settingsFs'

// serialize / deserialize と型は services/aiSessionCodec に分離 (#782 Phase 2)。
// 既存の import 元を維持するため型は再 export する。
export type {
  AiSession,
  AiSessionKind,
  AiSessionMeta,
} from '@/services/aiSessionCodec'

const PERSIST_DEBOUNCE_MS = 500

export const useAiSessionsStore = defineStore('aiSessions', () => {
  /** セッション本体 (メタ + 本文) のキャッシュ。id をキーとする。 */
  const sessions = ref<Map<string, AiSession>>(new Map())
  /** メタ全件 list 済みフラグ。`loadAllMeta()` で立てる。 */
  const metaLoaded = ref(false)

  /** sessionId 単位の debounce 永続化。 */
  const persistQueue = createKeyedDebouncedPersist<string>(
    (id) => persist(id),
    { delayMs: PERSIST_DEBOUNCE_MS },
  )

  /**
   * 全セッションのメタ + 本文を一括ロード。typical 数百件なら数 MB なので
   * 常駐させて問題ない。失敗ファイルはスキップしつつ進める。
   */
  async function loadAllMeta(): Promise<void> {
    if (metaLoaded.value) return
    if (!isTauri) {
      metaLoaded.value = true
      return
    }
    try {
      const files = await listAiSessionFiles()
      for (const file of files) {
        try {
          const raw = await readAiSessionFile(file)
          const session = deserialize(raw)
          if (session?.id) {
            sessions.value.set(session.id, session)
          }
        } catch (e) {
          console.warn(`[ai-sessions] load ${file} failed:`, e)
        }
      }
    } catch (e) {
      console.warn('[ai-sessions] listAiSessionFiles failed:', e)
    }
    // ref<Map> は in-place mutation 後に再代入で reactivity を発火
    sessions.value = new Map(sessions.value)
    metaLoaded.value = true
  }

  function get(id: string): AiSession | undefined {
    return sessions.value.get(id)
  }

  /**
   * 最後のメッセージから drawer 用 preview 文字列を作る。複数行 / 過剰な
   * 空白は 1 行に潰し、120 字で trim。tool_use 行は内容が技術的なので skip。
   */
  function buildLastMessagePreview(messages: ChatMessage[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (!m) continue
      // tool 結果 / tool 呼び出し行はユーザー視点の preview として有用でない
      if (m.toolResultFor || m.toolUseId) continue
      const text = (m.content ?? '').trim()
      if (text.length === 0) continue
      const flat = text.replace(/\s+/g, ' ').trim()
      return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat
    }
    return ''
  }

  /** 並べ替え済みメタリスト (updatedAt 降順)。ドロワーが購読する。 */
  function listSorted(): AiSessionMeta[] {
    const arr = Array.from(sessions.value.values()).map<AiSessionMeta>((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      model: s.model,
      connectionId: s.connectionId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
      lastMessagePreview: buildLastMessagePreview(s.messages),
      personaSkillId: s.personaSkillId,
    }))
    arr.sort((a, b) => b.updatedAt - a.updatedAt)
    return arr
  }

  /**
   * 新規セッションを生成してキャッシュに登録。ファイル書込は最初の
   * `updateMessages()` または `setTitle()` 呼び出し時に走る。
   *
   * `personaSkillId` を渡すと session に snapshot 保存される (#491)。
   * 呼出側は `aiConfig.personaSkillId` をデフォルトとして渡すのが想定 —
   * 一度 session 作成後は global 設定変更で過去 session の persona 表示は
   * 変わらない (Git commit Author header と同じ immutable semantic)。
   */
  function createNew(opts: {
    model: string
    connectionId: string
    title?: string
    kind?: AiSessionKind
    personaSkillId?: string
  }): AiSession {
    const existing = new Set(sessions.value.keys())
    const id = generateSessionId(new Date(), existing)
    const now = Date.now()
    const session: AiSession = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id,
      kind: opts.kind ?? 'chat',
      title: opts.title ?? '',
      model: opts.model,
      connectionId: opts.connectionId,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      messages: [],
      lastMessagePreview: '',
      personaSkillId: opts.personaSkillId || undefined,
    }
    sessions.value.set(id, session)
    sessions.value = new Map(sessions.value)
    schedulePersist(id)
    return session
  }

  /** 既存セッションを直接登録（マイグレーション専用、外部からは呼ばない）。 */
  function upsertRaw(session: AiSession): void {
    sessions.value.set(session.id, session)
    sessions.value = new Map(sessions.value)
  }

  /** メッセージ配列を差し替え。`updatedAt` を更新して debounce 永続化。 */
  function updateMessages(id: string, messages: ChatMessage[]): void {
    const cur = sessions.value.get(id)
    if (!cur) return
    const updated: AiSession = {
      ...cur,
      messages,
      messageCount: messages.length,
      updatedAt: Date.now(),
    }
    sessions.value.set(id, updated)
    sessions.value = new Map(sessions.value)
    schedulePersist(id)
  }

  function setTitle(id: string, title: string): void {
    const cur = sessions.value.get(id)
    if (!cur || cur.title === title) return
    const updated: AiSession = {
      ...cur,
      title,
      updatedAt: Date.now(),
    }
    sessions.value.set(id, updated)
    sessions.value = new Map(sessions.value)
    schedulePersist(id)
  }

  /**
   * このターンで発火した trigger skill の id をセッションへ累積する (#725)。
   * 既存との union (初出順維持) で、新規 id がなければ no-op — retry 再送等で
   * 同じ text から再判定されても無駄な persist が走らない。
   */
  function addTriggeredSkillIds(id: string, skillIds: readonly string[]): void {
    if (skillIds.length === 0) return
    const cur = sessions.value.get(id)
    if (!cur) return
    const merged = [...(cur.triggeredSkillIds ?? [])]
    const set = new Set(merged)
    for (const sid of skillIds) {
      if (!set.has(sid)) {
        set.add(sid)
        merged.push(sid)
      }
    }
    if (merged.length === (cur.triggeredSkillIds?.length ?? 0)) return
    const updated: AiSession = {
      ...cur,
      triggeredSkillIds: merged,
      updatedAt: Date.now(),
    }
    sessions.value.set(id, updated)
    sessions.value = new Map(sessions.value)
    schedulePersist(id)
  }

  function schedulePersist(id: string): void {
    persistQueue.schedule(id)
  }

  async function persist(id: string): Promise<void> {
    if (!isTauri) return
    const session = sessions.value.get(id)
    if (!session) return
    try {
      await writeAiSessionFile(aiSessionFilename(id), serialize(session))
    } catch (e) {
      console.warn(`[ai-sessions] persist ${id} failed:`, e)
    }
  }

  /** 即時にディスクに書き出す (ペンディングの有無に関わらず必ず書く)。 */
  async function flush(id: string): Promise<void> {
    persistQueue.cancel(id)
    await persist(id)
  }

  async function deleteSession(id: string): Promise<void> {
    persistQueue.cancel(id)
    sessions.value.delete(id)
    sessions.value = new Map(sessions.value)
    if (!isTauri) return
    try {
      await deleteAiSessionFile(aiSessionFilename(id))
    } catch (e) {
      console.warn(`[ai-sessions] delete ${id} failed:`, e)
    }
  }

  return {
    sessions,
    metaLoaded,
    loadAllMeta,
    get,
    listSorted,
    createNew,
    upsertRaw,
    updateMessages,
    setTitle,
    addTriggeredSkillIds,
    flush,
    deleteSession,
  }
})
