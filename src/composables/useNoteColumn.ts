import { invoke } from '@tauri-apps/api/core'
import { nextTick, onMounted, onUnmounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import type {
  ChannelSubscription,
  NormalizedNote,
  NoteUpdateEvent,
  ServerAdapter,
} from '@/adapters/types'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useNoteCapture } from '@/composables/useNoteCapture'
import { useNoteFocus } from '@/composables/useNoteFocus'
import { useNoteList } from '@/composables/useNoteList'
import { useNoteSound } from '@/composables/useNoteSound'
import { useStreamingBatch } from '@/composables/useStreamingBatch'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { AppError } from '@/utils/errors'

export interface NoteColumnConfig {
  getColumn: () => DeckColumnType
  fetch: (
    adapter: ServerAdapter,
    opts: { sinceId?: string; untilId?: string },
  ) => Promise<NormalizedNote[]>
  validate?: () => boolean
  cache?: {
    getKey: () => string | null
  }
  streaming?: {
    subscribe: (
      adapter: ServerAdapter,
      enqueue: (n: NormalizedNote) => void,
      callbacks: { onNoteUpdated: (event: NoteUpdateEvent) => void },
    ) => ChannelSubscription
  }
  refreshFetch?: (
    adapter: ServerAdapter,
    currentNotes: NormalizedNote[],
  ) => Promise<{ notes: NormalizedNote[]; mode: 'replace' | 'prepend' }>
}

export function useNoteColumn(config: NoteColumnConfig) {
  const {
    account,
    columnThemeVars,
    serverIconUrl,
    isLoading,
    error,
    initAdapter,
    getAdapter,
    setSubscription,
    disconnect,
    postForm,
    handlers,
    scroller,
    onScroll,
  } = useColumnSetup(config.getColumn)

  const router = useRouter()
  const isStreaming = !!config.streaming

  const {
    notes,
    noteIds,
    setNotes,
    setOnNotesChanged,
    onNoteUpdate,
    handlePosted,
    removeNote,
  } = useNoteList({
    getMyUserId: () => account.value?.userId,
    getAdapter,
    deleteHandler: handlers.delete,
    closePostForm: postForm.close,
  })

  // Streaming (Group A) or NoteCapture (Group B)
  const noteSound = isStreaming ? useNoteSound(() => account.value?.host) : null
  const streamingBatch = isStreaming
    ? useStreamingBatch({
        notes,
        noteIds,
        scroller,
        onNewNotes: () => {
          if (!config.getColumn().soundMuted) noteSound?.play()
        },
      })
    : null

  if (!isStreaming) {
    const { sync } = useNoteCapture(() => getAdapter()?.stream, onNoteUpdate)
    setOnNotesChanged(sync)
  }

  const { focusedNoteId } = useNoteFocus(
    config.getColumn().id,
    notes,
    scroller,
    handlers,
    (note) => router.push(`/note/${note._accountId}/${note.id}`),
  )

  const pendingNotes =
    streamingBatch?.pendingNotes ?? shallowRef<NormalizedNote[]>([])

  async function connect(useCache = false) {
    error.value = null
    isLoading.value = true

    if (config.validate && !config.validate()) {
      isLoading.value = false
      return
    }

    if (useCache && config.cache) {
      const column = config.getColumn()
      const cacheKey = config.cache.getKey()
      if (column.accountId && cacheKey) {
        try {
          const cached = await invoke<NormalizedNote[]>(
            'api_get_cached_timeline',
            {
              accountId: column.accountId,
              timelineType: cacheKey,
              limit: 40,
            },
          )
          if (cached.length > 0) setNotes(cached)
        } catch {
          /* non-critical */
        }
      }
    }

    try {
      const adapter = await initAdapter()
      if (!adapter) return

      const sinceId = notes.value.length > 0 ? notes.value[0]?.id : undefined
      const fetched = await config.fetch(adapter, sinceId ? { sinceId } : {})
      if (sinceId && fetched.length > 0) {
        const newNotes = fetched.filter((n) => !noteIds.has(n.id))
        if (newNotes.length > 0) setNotes([...newNotes, ...notes.value])
      } else if (fetched.length > 0) {
        setNotes(fetched)
      }

      if (config.streaming && streamingBatch) {
        adapter.stream.connect()
        setSubscription(
          config.streaming.subscribe(adapter, streamingBatch.enqueueNote, {
            onNoteUpdated: onNoteUpdate,
          }),
        )
        noteSound?.warmup()
      }
    } catch (e) {
      if (notes.value.length === 0) {
        error.value = AppError.from(e)
      }
    } finally {
      isLoading.value = false
    }
  }

  async function loadMore() {
    const adapter = getAdapter()
    if (!adapter || isLoading.value || notes.value.length === 0) return
    const lastNote = notes.value.at(-1)
    if (!lastNote) return
    if (config.validate && !config.validate()) return
    isLoading.value = true
    try {
      const older = await config.fetch(adapter, { untilId: lastNote.id })
      setNotes([...notes.value, ...older])
    } catch (e) {
      error.value = AppError.from(e)
    } finally {
      isLoading.value = false
    }
  }

  function handleScroll() {
    streamingBatch?.handleScroll()
    onScroll(loadMore)
  }

  function scrollToTop() {
    if (streamingBatch) {
      streamingBatch.scrollToTop()
    } else {
      nextTick(() => {
        const el = scroller.value?.$el as HTMLElement | undefined
        if (el) el.scrollTop = 0
      })
    }
  }

  async function refresh() {
    if (isStreaming) return
    const adapter = getAdapter()
    if (!adapter || isLoading.value) return
    if (config.validate && !config.validate()) return
    isLoading.value = true
    error.value = null
    try {
      if (config.refreshFetch) {
        const result = await config.refreshFetch(adapter, notes.value)
        if (result.mode === 'replace') {
          setNotes(result.notes)
          scrollToTop()
        } else if (result.notes.length > 0) {
          setNotes([...result.notes, ...notes.value])
          scrollToTop()
        }
      } else {
        const fetched = await config.fetch(adapter, {})
        setNotes(fetched)
        scrollToTop()
      }
    } catch (e) {
      error.value = AppError.from(e)
    } finally {
      isLoading.value = false
    }
  }

  let lastResumeAt = 0

  async function onResume() {
    const now = Date.now()
    if (now - lastResumeAt < 3000) return
    lastResumeAt = now

    const adapter = getAdapter()
    if (!adapter || !account.value) return
    if (config.validate && !config.validate()) return

    const sinceId = notes.value[0]?.id

    // Run cache fetch and API fetch in parallel
    const cachePromise =
      isStreaming && config.cache
        ? (async () => {
            const column = config.getColumn()
            // biome-ignore lint/style/noNonNullAssertion: guarded by config.cache check above
            const cacheKey = config.cache!.getKey()
            if (!column.accountId || !cacheKey) return []
            try {
              return await invoke<NormalizedNote[]>('api_get_cached_timeline', {
                accountId: column.accountId,
                timelineType: cacheKey,
                limit: 40,
              })
            } catch {
              return []
            }
          })()
        : Promise.resolve([] as NormalizedNote[])

    const apiPromise = sinceId
      ? config.fetch(adapter, { sinceId }).catch(() => [] as NormalizedNote[])
      : Promise.resolve([] as NormalizedNote[])

    const [cached, fetched] = await Promise.all([cachePromise, apiPromise])

    // Merge results: API results take priority, then cache
    const allNew = [...fetched, ...cached].filter((n) => !noteIds.has(n.id))
    if (allNew.length > 0) {
      // Deduplicate by id (API results first)
      const seen = new Set<string>()
      const deduped = allNew.filter((n) => {
        if (seen.has(n.id)) return false
        seen.add(n.id)
        return true
      })
      setNotes([...deduped, ...notes.value])
    }
  }

  onMounted(() => {
    window.addEventListener('deck-resume', onResume)
    connect(true)
  })

  onUnmounted(() => {
    window.removeEventListener('deck-resume', onResume)
    disconnect()
    streamingBatch?.resetBatch()
  })

  return {
    account,
    columnThemeVars,
    serverIconUrl,
    isLoading,
    error,
    notes,
    focusedNoteId,
    pendingNotes,
    postForm,
    handlers,
    scroller,
    scrollToTop,
    handleScroll,
    handlePosted,
    removeNote,
    refresh,
  }
}
