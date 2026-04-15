import { ref } from 'vue'
import type { NoteVisibility } from '@/adapters/types'
import { isTauri, readMemos, writeMemos } from '@/utils/settingsFs'
import { getStorageJson, STORAGE_KEYS, setStorageJson } from '@/utils/storage'

export interface MemoData {
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

export interface StoredMemo {
  updatedAt: string
  data: MemoData
}

export type StoredMemos = Record<string, StoredMemo>

/**
 * 新しいメモ用のキーを生成。サーバー/アカウントに紐づかず、時系列で並ぶ。
 * 形式: `{base36(timestamp)}-{random36(6)}`
 */
export function generateMemoKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// --- File-backed cache (Tauri) with localStorage fallback (browser dev) ---

let cache: StoredMemos = {}
let loaded = false

export const memosVersion = ref(0)

function readFromLocalStorage(): StoredMemos {
  const raw = getStorageJson<unknown>(STORAGE_KEYS.memos, {})
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as StoredMemos
  }
  return {}
}

function writeToLocalStorage(memos: StoredMemos): void {
  setStorageJson(STORAGE_KEYS.memos, memos)
}

/**
 * Load memos from disk (Tauri) or localStorage (browser) into memory.
 * Idempotent — subsequent calls are no-ops.
 */
export async function ensureMemosLoaded(): Promise<void> {
  if (loaded) return
  if (isTauri) {
    let fileContent = ''
    try {
      fileContent = await readMemos()
    } catch {
      fileContent = ''
    }
    if (fileContent) {
      try {
        const parsed = JSON.parse(fileContent)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          cache = parsed as StoredMemos
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
      void writeMemos(JSON.stringify(cache, null, 2))
      writeTimer = null
    }, 300)
  } else {
    writeToLocalStorage(cache)
  }
}

export function loadAllMemos(): StoredMemos {
  return cache
}

export function loadMemo(memoKey: string): StoredMemo | null {
  return cache[memoKey] ?? null
}

export function saveMemo(memoKey: string, data: MemoData): StoredMemo {
  const stored: StoredMemo = { updatedAt: new Date().toISOString(), data }
  cache = { ...cache, [memoKey]: stored }
  persist()
  memosVersion.value++
  return stored
}

export function deleteMemo(memoKey: string): void {
  const next = { ...cache }
  delete next[memoKey]
  cache = next
  persist()
  memosVersion.value++
}

export function deleteAllMemos(): void {
  cache = {}
  persist()
  memosVersion.value++
}
