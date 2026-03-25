import { onMounted, ref, shallowRef, watch } from 'vue'
import type { NormalizedNote, ServerAdapter } from '@/adapters/types'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useAccountsStore } from '@/stores/accounts'
import { useNoteStore } from '@/stores/notes'
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
  isLoading: ReturnType<typeof ref<boolean>>
  error: ReturnType<typeof ref<AppError | null>>
  scroller: ReturnType<typeof ref<HTMLElement | null>>
  onScroll: (loadMore: () => void) => void
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
  const { fetchNotes, isCrossAccount, isLoading, error, scroller, onScroll } =
    options

  const accountsStore = useAccountsStore()
  const multiAdapters = useMultiAccountAdapters()
  const noteStore = useNoteStore()

  const notes = shallowRef<NormalizedNote[]>([])
  const noteScrollerRef = ref<{
    getElement: () => HTMLElement | null
    scrollToIndex: (
      index: number,
      opts?: { align?: string; behavior?: string },
    ) => void
  } | null>(null)

  watch(
    noteScrollerRef,
    () => {
      scroller.value = noteScrollerRef.value?.getElement() ?? null
    },
    { flush: 'post' },
  )

  function scrollToTop() {
    scroller.value?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function connectCrossAccount() {
    error.value = null
    isLoading.value = true
    const accounts = accountsStore.accounts.filter((a) => a.hasToken)

    try {
      const results = await Promise.allSettled(
        accounts.map(async (acc) => {
          const adapter = await multiAdapters.getOrCreate(acc.id)
          if (!adapter) return []
          return fetchNotes(adapter)
        }),
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
      const results = await Promise.allSettled(
        accounts.map(async (acc) => {
          const adapter = await multiAdapters.getOrCreate(acc.id)
          if (!adapter) return []
          const lastForAccount = [...notes.value]
            .reverse()
            .find((n) => n._accountId === acc.id)
          if (!lastForAccount) return fetchNotes(adapter)
          return fetchNotes(adapter, { untilId: lastForAccount.id })
        }),
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
    onScroll(loadMoreCrossAccount)
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
