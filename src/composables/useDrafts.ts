import { ref } from 'vue'
import type { NoteVisibility } from '@/adapters/types'
import type { JsonValue } from '@/bindings'
import { AppError } from '@/utils/errors'
import { commands, unwrap } from '@/utils/tauriInvoke'

/**
 * Misskey `notes/drafts/*` (2025.6+) をアカウントごとのサーバー保存で扱う。
 * ローカル保存版はメモ機能 ({@link ./useMemos}) として別途残る。
 */
export interface DraftData {
  text: string
  cw: string
  showCw: boolean
  visibility: NoteVisibility
  localOnly: boolean
  fileIds: string[]
  pollChoices: string[]
  pollMultiple: boolean
  showPoll: boolean
  scheduledAt: string | null
}

export interface DraftContext {
  replyId?: string | null
  renoteId?: string | null
  channelId?: string | null
  hashtag?: string | null
}

export interface StoredDraft {
  /** サーバー側 draft id */
  id: string
  /** サーバー createdAt (ISO8601) */
  updatedAt: string
  data: DraftData
  replyId: string | null
  renoteId: string | null
  channelId: string | null
  hashtag: string | null
}

interface NoteDraftRaw {
  id: string
  createdAt: string
  text: string | null
  cw: string | null
  visibility: string
  localOnly?: boolean
  fileIds?: string[]
  hashtag?: string | null
  replyId?: string | null
  renoteId?: string | null
  channelId?: string | null
  poll?: {
    choices: string[]
    multiple?: boolean
    expiresAt?: number | null
  } | null
  scheduledAt?: number | null
}

// accountId → draftId → StoredDraft
const cache: Record<string, Record<string, StoredDraft>> = {}
export const draftsVersion = ref(0)
export const draftsLoading = ref(false)

function toStored(raw: NoteDraftRaw): StoredDraft {
  const pollChoices = raw.poll?.choices ?? []
  return {
    id: raw.id,
    updatedAt: raw.createdAt,
    data: {
      text: raw.text ?? '',
      cw: raw.cw ?? '',
      showCw: !!raw.cw,
      visibility: (raw.visibility as NoteVisibility) ?? 'public',
      localOnly: raw.localOnly ?? false,
      fileIds: raw.fileIds ?? [],
      pollChoices: pollChoices.length >= 2 ? pollChoices : ['', ''],
      pollMultiple: raw.poll?.multiple ?? false,
      showPoll: pollChoices.length >= 2,
      scheduledAt:
        raw.scheduledAt != null
          ? new Date(raw.scheduledAt).toISOString()
          : null,
    },
    replyId: raw.replyId ?? null,
    renoteId: raw.renoteId ?? null,
    channelId: raw.channelId ?? null,
    hashtag: raw.hashtag ?? null,
  }
}

function buildParams(data: DraftData, ctx: DraftContext): JsonValue {
  const validChoices = data.showPoll
    ? data.pollChoices.filter((c) => c.trim())
    : []
  return {
    text: data.text || null,
    cw: data.showCw && data.cw ? data.cw : null,
    visibility: data.visibility,
    localOnly: data.localOnly,
    fileIds: data.fileIds,
    replyId: ctx.replyId ?? null,
    renoteId: ctx.renoteId ?? null,
    channelId: ctx.channelId ?? null,
    hashtag: ctx.hashtag ?? null,
    poll:
      validChoices.length >= 2
        ? { choices: validChoices, multiple: data.pollMultiple }
        : null,
    scheduledAt: data.scheduledAt ? new Date(data.scheduledAt).getTime() : null,
  }
}

export async function refreshDrafts(accountId: string): Promise<void> {
  draftsLoading.value = true
  try {
    const raw = unwrap(
      await commands.apiRequest(accountId, 'notes/drafts/list', { limit: 100 }),
    ) as unknown as NoteDraftRaw[] | null
    const map: Record<string, StoredDraft> = {}
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        map[entry.id] = toStored(entry)
      }
    }
    cache[accountId] = map
    draftsVersion.value++
  } catch (e) {
    // notes/drafts/* は Misskey 2025.6+。未対応サーバーは空扱い
    cache[accountId] = cache[accountId] ?? {}
    console.warn('[drafts] list failed:', AppError.from(e).message)
  } finally {
    draftsLoading.value = false
  }
}

export function loadAllDrafts(accountId: string): Record<string, StoredDraft> {
  return cache[accountId] ?? {}
}

export async function saveDraft(
  accountId: string,
  draftId: string | null,
  data: DraftData,
  ctx: DraftContext = {},
): Promise<StoredDraft> {
  const params = buildParams(data, ctx)
  let raw: NoteDraftRaw
  if (draftId == null) {
    const res = unwrap(
      await commands.apiRequest(accountId, 'notes/drafts/create', params),
    ) as unknown as { createdDraft: NoteDraftRaw }
    raw = res.createdDraft
  } else {
    const updateParams: JsonValue = {
      ...(params as Partial<{ [k: string]: JsonValue }>),
      draftId,
    }
    const res = unwrap(
      await commands.apiRequest(accountId, 'notes/drafts/update', updateParams),
    ) as unknown as { updatedDraft: NoteDraftRaw }
    raw = res.updatedDraft
  }
  const stored = toStored(raw)
  cache[accountId] = { ...(cache[accountId] ?? {}), [stored.id]: stored }
  draftsVersion.value++
  return stored
}

export async function deleteDraft(
  accountId: string,
  draftId: string,
): Promise<void> {
  try {
    unwrap(
      await commands.apiRequest(accountId, 'notes/drafts/delete', { draftId }),
    )
  } catch (e) {
    // サーバー側で既に消えているケース (noSuchNoteDraft) はキャッシュ同期だけで良い
    const msg = AppError.from(e).message
    if (!/noSuchNoteDraft|NO_SUCH_NOTE_DRAFT/i.test(msg)) throw e
  }
  const existing = cache[accountId]
  if (existing && draftId in existing) {
    const next = { ...existing }
    delete next[draftId]
    cache[accountId] = next
    draftsVersion.value++
  }
}

export async function deleteAllDrafts(accountId: string): Promise<void> {
  const ids = Object.keys(cache[accountId] ?? {})
  if (ids.length === 0) return
  await Promise.allSettled(
    ids.map((id) =>
      commands.apiRequest(accountId, 'notes/drafts/delete', { draftId: id }),
    ),
  )
  cache[accountId] = {}
  draftsVersion.value++
}
