import type { NoteVisibility } from '@/adapters/types'
import { getStorageJson, STORAGE_KEYS, setStorageJson } from '@/utils/storage'

export interface Draft {
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

const MAX_DRAFTS = 10

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function loadDrafts(accountId: string): Draft[] {
  return getStorageJson<Draft[]>(STORAGE_KEYS.drafts(accountId), [])
}

export function saveDraft(
  accountId: string,
  draft: Omit<Draft, 'id' | 'savedAt'>,
): Draft {
  const drafts = loadDrafts(accountId)
  const newDraft: Draft = {
    ...draft,
    id: generateId(),
    savedAt: Date.now(),
  }
  drafts.unshift(newDraft)
  // Keep only the latest entries
  const trimmed = drafts.slice(0, MAX_DRAFTS)
  setStorageJson(STORAGE_KEYS.drafts(accountId), trimmed)
  return newDraft
}

export function deleteDraft(accountId: string, draftId: string): void {
  const drafts = loadDrafts(accountId).filter((d) => d.id !== draftId)
  setStorageJson(STORAGE_KEYS.drafts(accountId), drafts)
}
