import { ref } from 'vue'
import type { NoteVisibility } from '@/adapters/types'
import { isTauri, readDraftFile, writeDraftFile } from '@/utils/settingsFs'
import {
  getStorageJson,
  removeStorage,
  STORAGE_KEYS,
  setStorageJson,
} from '@/utils/storage'

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

export interface StoredDraft {
  updatedAt: string
  data: DraftData
}

export type StoredDrafts = Record<string, StoredDraft>

/**
 * Misskey 本家 MkPostForm.vue の `draftKey` と同じ算出式。
 * 同じコンテキスト（reply/renote/channel/new）の編集中は常に1件だけが保存され、
 * 次回同じコンテキストを開いたとき自動で復元できるようにする。
 */
export function computeDraftKey(ctx: {
  userId: string
  channelId?: string | null
  renoteId?: string | null
  replyId?: string | null
}): string {
  let key = ctx.channelId ? `channel:${ctx.channelId}` : ''
  if (ctx.renoteId) {
    key += `renote:${ctx.renoteId}`
  } else if (ctx.replyId) {
    key += `reply:${ctx.replyId}`
  } else {
    key += `note:${ctx.userId}`
  }
  return key
}

// --- Legacy v1 (array with id/savedAt) → v2 (draftKey map) ---
interface LegacyDraftV1 {
  id: string
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
  savedAt: number
}

function migrate(raw: unknown): { drafts: StoredDrafts; migrated: boolean } {
  if (Array.isArray(raw)) {
    const drafts: StoredDrafts = {}
    for (const d of raw as LegacyDraftV1[]) {
      if (!d || typeof d !== 'object' || !d.id) continue
      drafts[`legacy:${d.id}`] = {
        updatedAt: new Date(d.savedAt || Date.now()).toISOString(),
        data: {
          text: d.text ?? '',
          cw: d.cw ?? '',
          showCw: !!d.showCw,
          visibility: d.visibility,
          localOnly: !!d.localOnly,
          fileIds: d.fileIds ?? [],
          pollChoices: d.pollChoices ?? [],
          pollMultiple: !!d.pollMultiple,
          showPoll: !!d.showPoll,
          scheduledAt: d.scheduledAt ?? null,
        },
      }
    }
    return { drafts, migrated: true }
  }
  if (raw && typeof raw === 'object') {
    return { drafts: raw as StoredDrafts, migrated: false }
  }
  return { drafts: {}, migrated: false }
}

// --- File-backed cache (Tauri) with localStorage fallback (browser dev) ---

const cache = new Map<string, StoredDrafts>()
const loaded = new Set<string>()

/**
 * Reactive version counter — bumped on every save/delete so that components
 * can watch it to re-render when drafts mutate from elsewhere (e.g. auto-save
 * triggered by usePostFormState while the picker is open).
 */
export const draftsVersion = ref(0)

function readFromLocalStorage(accountId: string): StoredDrafts {
  const raw = getStorageJson<unknown>(STORAGE_KEYS.drafts(accountId), {})
  return migrate(raw).drafts
}

function writeToLocalStorage(accountId: string, drafts: StoredDrafts): void {
  setStorageJson(STORAGE_KEYS.drafts(accountId), drafts)
}

/**
 * Load drafts from disk (Tauri) or localStorage (browser) into the in-memory
 * cache. Must be awaited before sync read/write APIs are used for that account.
 * One-time migration: if no file exists yet but localStorage has entries, the
 * data is copied to disk and the localStorage entry is removed.
 */
export async function ensureDraftsLoaded(accountId: string): Promise<void> {
  if (loaded.has(accountId)) return
  let drafts: StoredDrafts = {}
  if (isTauri) {
    let fileContent = ''
    try {
      fileContent = await readDraftFile(accountId)
    } catch {
      fileContent = ''
    }
    if (fileContent) {
      try {
        drafts = migrate(JSON.parse(fileContent)).drafts
      } catch {
        drafts = {}
      }
    } else {
      // Migrate localStorage → file (one-time)
      const legacy = readFromLocalStorage(accountId)
      if (Object.keys(legacy).length > 0) {
        drafts = legacy
        try {
          await writeDraftFile(accountId, JSON.stringify(drafts, null, 2))
          removeStorage(STORAGE_KEYS.drafts(accountId))
        } catch {
          // Keep localStorage as fallback if write fails
        }
      }
    }
  } else {
    drafts = readFromLocalStorage(accountId)
  }
  cache.set(accountId, drafts)
  loaded.add(accountId)
}

const writeTimers = new Map<string, ReturnType<typeof setTimeout>>()

function persist(accountId: string) {
  const drafts = cache.get(accountId) ?? {}
  if (isTauri) {
    const existing = writeTimers.get(accountId)
    if (existing) clearTimeout(existing)
    writeTimers.set(
      accountId,
      setTimeout(() => {
        void writeDraftFile(accountId, JSON.stringify(drafts, null, 2))
        writeTimers.delete(accountId)
      }, 300),
    )
  } else {
    writeToLocalStorage(accountId, drafts)
  }
}

export function loadAllDrafts(accountId: string): StoredDrafts {
  return cache.get(accountId) ?? {}
}

export function loadDraft(
  accountId: string,
  draftKey: string,
): StoredDraft | null {
  return loadAllDrafts(accountId)[draftKey] ?? null
}

export function saveDraft(
  accountId: string,
  draftKey: string,
  data: DraftData,
): StoredDraft {
  const next = { ...loadAllDrafts(accountId) }
  const stored: StoredDraft = { updatedAt: new Date().toISOString(), data }
  next[draftKey] = stored
  cache.set(accountId, next)
  persist(accountId)
  draftsVersion.value++
  return stored
}

export function deleteDraft(accountId: string, draftKey: string): void {
  const next = { ...loadAllDrafts(accountId) }
  delete next[draftKey]
  cache.set(accountId, next)
  persist(accountId)
  draftsVersion.value++
}

export function deleteAllDrafts(accountId: string): void {
  cache.set(accountId, {})
  persist(accountId)
  draftsVersion.value++
}
