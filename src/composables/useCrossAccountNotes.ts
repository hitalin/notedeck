import { onMounted, type Ref, shallowRef } from 'vue'
import type { NormalizedNote, ServerAdapter } from '@/adapters/types'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useNoteScrollerRef } from '@/composables/useNoteScrollerRef'
import { useAccountsStore } from '@/stores/accounts'
import { useNoteStore } from '@/stores/notes'
import { mapWithConcurrency } from '@/utils/concurrency'
import { AppError } from '@/utils/errors'

export interface CrossAccountNotesOptions {
  /** API call to fetch notes for one account */
  fetchNotes: (
    adapter: ServerAdapter,
    opts?: { untilId?: string },
  ) => Promise<NormalizedNote[]>

  /** Whether this is cross-account mode */
  isCrossAccount: () => boolean

  /** Loading / error / scroller refs from useColumnSetup */
  isLoading: Ref<boolean>
  error: Ref<AppError | null>
  scroller: Ref<HTMLElement | null>
  onScrollReport: () => void
}

/** Promise.allSettled の結果からノートを集約 */
function collectFulfilled(
  results: PromiseSettledResult<NormalizedNote[]>[],
): NormalizedNote[] {
  const collected: NormalizedNote[] = []
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      collected.push(...r.value)
    }
  }
  return collected
}

/** 既存IDを除外し、createdAt降順でソート */
function dedup(
  incoming: NormalizedNote[],
  existingIds?: Set<string>,
): NormalizedNote[] {
  const seen = existingIds ?? new Set<string>()
  return incoming
    .filter((n) => {
      if (seen.has(n.id)) return false
      seen.add(n.id)
      return true
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function useCrossAccountNotes(options: CrossAccountNotesOptions) {
  const {
    fetchNotes,
    isCrossAccount,
    isLoading,
    error,
    scroller,
    onScrollReport,
  } = options

  const accountsStore = useAccountsStore()
  const multiAdapters = useMultiAccountAdapters()
  const noteStore = useNoteStore()

  const notes = shallowRef<NormalizedNote[]>([])
  const { noteScrollerRef } = useNoteScrollerRef(scroller)

  function scrollToTop() {
    if (noteScrollerRef.value) {
      noteScrollerRef.value.scrollToIndex(0, {
        align: 'start',
        behavior: 'smooth',
      })
    } else {
      scroller.value?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  async function connectCrossAccount() {
    error.value = null
    isLoading.value = true
    const accounts = accountsStore.accounts.filter((a) => a.hasToken)

    try {
      const results = await mapWithConcurrency(
        accounts,
        async (acc) => {
          const adapter = await multiAdapters.getOrCreate(acc.id)
          if (!adapter) return []
          return fetchNotes(adapter)
        },
        3,
      )

      notes.value = dedup(collectFulfilled(results))
    } catch (e) {
      error.value = AppError.from(e)
    } finally {
      isLoading.value = false
    }
  }

  async function loadMoreCrossAccount() {
    if (isLoading.value || notes.value.length === 0) return
    isLoading.value = true
    const accounts = accountsStore.accounts.filter((a) => a.hasToken)

    try {
      const results = await mapWithConcurrency(
        accounts,
        async (acc) => {
          const adapter = await multiAdapters.getOrCreate(acc.id)
          if (!adapter) return []
          const lastForAccount = [...notes.value]
            .reverse()
            .find((n) => n._accountId === acc.id)
          if (!lastForAccount) return fetchNotes(adapter)
          return fetchNotes(adapter, { untilId: lastForAccount.id })
        },
        3,
      )

      const existingIds = new Set(notes.value.map((n) => n.id))
      const newOlder = dedup(collectFulfilled(results), existingIds)
      notes.value = [...notes.value, ...newOlder]
    } catch (e) {
      error.value = AppError.from(e)
    } finally {
      isLoading.value = false
    }
  }

  function handleScroll() {
    onScrollReport()
  }

  async function removeNote(note: NormalizedNote) {
    const adapter = await multiAdapters.getOrCreate(note._accountId)
    if (!adapter) return
    try {
      await adapter.api.deleteNote(note.id)
    } catch {
      return
    }
    notes.value = notes.value.filter((n) => n.id !== note.id)
    noteStore.remove(note.id)
  }

  onMounted(() => {
    if (isCrossAccount()) {
      connectCrossAccount()
    }
  })

  return {
    notes,
    noteScrollerRef,
    scrollToTop,
    connectCrossAccount,
    loadMoreCrossAccount,
    handleScroll,
    removeNote,
  }
}
