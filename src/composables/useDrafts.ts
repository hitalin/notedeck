import { ref } from 'vue'
import type { NoteVisibility } from '@/adapters/types'
import { isTauri, readDrafts, writeDrafts } from '@/utils/settingsFs'
import { getStorageJson, STORAGE_KEYS, setStorageJson } from '@/utils/storage'

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

/** accountId → drafts keyed by draftKey. */
type DraftsFile = Record<string, StoredDrafts>

/**
 * Unique draft id (timestamp-prefixed).
 *
 * TODO: Misskey のサーバー側下書き API (`notes/drafts/*`, 2025.6+) が
 * notecli に実装されたら、このモジュール全体を adapter 経由の実装に
 * 差し替える。public API は揃えてあるので UI 側は無変更のはず。
 */
export function generateDraftKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// --- File-backed cache (Tauri) with localStorage fallback (browser dev) ---

let cache: DraftsFile = {}
let loaded = false

export const draftsVersion = ref(0)

function readFromLocalStorage(): DraftsFile {
  const raw = getStorageJson<unknown>(STORAGE_KEYS.drafts, {})
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as DraftsFile
  }
  return {}
}

function writeToLocalStorage(): void {
  setStorageJson(STORAGE_KEYS.drafts, cache)
}

export async function ensureDraftsLoaded(): Promise<void> {
  if (loaded) return
  if (isTauri) {
    let fileContent = ''
    try {
      fileContent = await readDrafts()
    } catch {
      fileContent = ''
    }
    if (fileContent) {
      try {
        const parsed = JSON.parse(fileContent)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          cache = parsed as DraftsFile
        }
      } catch {
        cache = {}
      }
    }
  } else {
    cache = readFromLocalStorage()
  }
  loaded = true
}

let writeTimer: ReturnType<typeof setTimeout> | null = null

function persist() {
  if (isTauri) {
    if (writeTimer) clearTimeout(writeTimer)
    writeTimer = setTimeout(() => {
      void writeDrafts(JSON.stringify(cache, null, 2))
      writeTimer = null
    }, 300)
  } else {
    writeToLocalStorage()
  }
}

export function loadAllDrafts(accountId: string): StoredDrafts {
  return cache[accountId] ?? {}
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
  const stored: StoredDraft = { updatedAt: new Date().toISOString(), data }
  const existing = cache[accountId] ?? {}
  cache = {
    ...cache,
    [accountId]: { ...existing, [draftKey]: stored },
  }
  persist()
  draftsVersion.value++
  return stored
}

export function deleteDraft(accountId: string, draftKey: string): void {
  const existing = cache[accountId]
  if (!existing || !(draftKey in existing)) return
  const next = { ...existing }
  delete next[draftKey]
  cache = { ...cache, [accountId]: next }
  persist()
  draftsVersion.value++
}

export function deleteAllDrafts(accountId: string): void {
  if (!(accountId in cache)) return
  cache = { ...cache, [accountId]: {} }
  persist()
  draftsVersion.value++
}
