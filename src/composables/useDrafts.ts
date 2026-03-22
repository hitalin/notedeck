import type { NoteVisibility } from '@/adapters/types'
import { getStorageJson, setStorageJson } from '@/utils/storage'

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
const STORAGE_PREFIX = 'nd-drafts-'

function storageKey(accountId: string): string {
  return `${STORAGE_PREFIX}${accountId}`
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function loadDrafts(accountId: string): Draft[] {
  return getStorageJson<Draft[]>(storageKey(accountId), [])
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
  setStorageJson(storageKey(accountId), trimmed)
  return newDraft
}

export function deleteDraft(accountId: string, draftId: string): void {
  const drafts = loadDrafts(accountId).filter((d) => d.id !== draftId)
  setStorageJson(storageKey(accountId), drafts)
}
