import { invoke } from '@tauri-apps/api/core'
import { nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type {
  ChannelSubscription,
  NormalizedNote,
  NoteUpdateEvent,
  ServerAdapter,
} from '@/adapters/types'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useColumnVisible } from '@/composables/useColumnVisibility'
import { useNavigation } from '@/composables/useNavigation'
import { useNoteCapture } from '@/composables/useNoteCapture'
import { useNoteFocus } from '@/composables/useNoteFocus'
import { useNoteList } from '@/composables/useNoteList'
import { useNoteSound } from '@/composables/useNoteSound'
import { usePullToRefresh } from '@/composables/usePullToRefresh'
import { useStreamingBatch } from '@/composables/useStreamingBatch'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useNoteStore } from '@/stores/notes'
import { dedup } from '@/utils/dedup'
import { AppError } from '@/utils/errors'
import { insertIntoSorted } from '@/utils/sortNotes'

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
  const noteStore = useNoteStore()
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
  } = useColumnSetup(config.getColumn, {
    isOffline: () => isOffline.value,
  })

  const { navigateToNote } = useNavigation()
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
  const myNoteSound = isStreaming
    ? useNoteSound(() => account.value?.host, 'syuilo/n-cea-4va')
    : null
  const streamingBatch = isStreaming
    ? useStreamingBatch({
        notes,
        noteIds,
        scroller,
        onNewNotes: (batch) => {
          if (config.getColumn().soundMuted) return
          const myId = account.value?.userId
          const hasMy = myId && batch.some((n) => n.user.id === myId)
          if (hasMy) {
            myNoteSound?.play()
          } else {
            noteSound?.play()
          }
        },
      })
    : null

  if (!isStreaming) {
    const { sync } = useNoteCapture(() => getAdapter()?.stream, onNoteUpdate)
    setOnNotesChanged(sync)
  }

  // Pause streaming batch when column scrolls off-screen
  if (streamingBatch) {
    const { isVisible } = useColumnVisible(config.getColumn().id)
    watch(isVisible, (visible) => {
      streamingBatch.setPaused(!visible)
    })
  }

  const { focusedNoteId } = useNoteFocus(
    config.getColumn().id,
    notes,
    scroller,
    handlers,
    (note) => navigateToNote(note._accountId, note.id),
  )

  const pendingNotes =
    streamingBatch?.pendingNotes ?? shallowRef<NormalizedNote[]>([])
  const animateEnter = streamingBatch?.animateEnter ?? ref(false)

  /** True when API is unreachable and displaying cached notes */
  const isOffline = ref(false)

  // When account loses token (logout with keep-data), switch to cache display
  watch(
    () => account.value?.hasToken,
    async (hasToken, prev) => {
      if (prev && hasToken === false) {
        disconnect()
        const column = config.getColumn()
        const cacheKey = config.cache?.getKey()
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
        isOffline.value = true
        isLoading.value = false
      }
    },
  )

  /**
   * Background-verify that cached notes still exist on the server.
   * Any note returning 404 is purged from noteStore + DB cache.
   * Confirmed notes are refreshed with latest data.
   */
  async function purgeStaleCachedNotes(
    adapter: ServerAdapter,
    idsToVerify: string[],
  ) {
    const BATCH_SIZE = 5
    for (let i = 0; i < idsToVerify.length; i += BATCH_SIZE) {
      if (!getAdapter()) return // column was unmounted
      const batch = idsToVerify.slice(i, i + BATCH_SIZE)
      await Promise.allSettled(
        batch.map(async (id) => {
          try {
            const fresh = await adapter.api.getNote(id)
            noteStore.update(id, fresh)
          } catch {
            noteStore.remove(id)
            invoke('api_delete_cached_note', { noteId: id }).catch(() => {})
          }
        }),
      )
    }
  }

  async function connect(useCache = false) {
    error.value = null

    if (config.validate && !config.validate()) {
      return
    }

    let cachedIds: string[] = []

    // Load cache BEFORE setting isLoading to avoid skeleton flash
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
          if (cached.length > 0) {
            setNotes(cached)
            cachedIds = cached.map((n) => n.id)
          }
        } catch {
          /* non-critical */
        }
      }
    }

    // Only show skeleton if no cached notes are available
    if (notes.value.length === 0) {
      isLoading.value = true
    }

    // Logged-out account: show cached notes in read-only mode
    if (account.value && !account.value.hasToken) {
      isOffline.value = true
      isLoading.value = false
      return
    }

    try {
      const adapter = await initAdapter()
      if (!adapter) return

      // Start streaming setup early (runs in parallel with API fetch below).
      // Combined commands handle connect + subscribe in a single IPC round-trip.
      if (config.streaming && streamingBatch) {
        adapter.stream.connect()
        adapter.stream.on('disconnected', () => {
          isOffline.value = true
        })
        adapter.stream.on('reconnecting', () => {
          isOffline.value = true
        })
        adapter.stream.on('connected', () => {
          isOffline.value = false
        })
        setSubscription(
          config.streaming.subscribe(adapter, streamingBatch.enqueueNote, {
            onNoteUpdated: (event) => {
              if (event.type === 'deleted')
                streamingBatch.removePending(event.noteId)
              onNoteUpdate(event)
            },
          }),
        )
        noteSound?.warmup()
      }

      const sinceId = notes.value.length > 0 ? notes.value[0]?.id : undefined
      const dedupKey = `${config.getColumn().accountId}:${config.cache?.getKey() ?? 'default'}`
      const fetched = await dedup(dedupKey, () =>
        config.fetch(adapter, sinceId ? { sinceId } : {}),
      )
      const freshIds = new Set(fetched.map((n) => n.id))

      if (sinceId && fetched.length > 0) {
        const newNotes = fetched.filter((n) => !noteIds.has(n.id))
        if (newNotes.length > 0)
          setNotes(insertIntoSorted(notes.value, newNotes))
      } else if (fetched.length > 0) {
        setNotes(fetched)
      }

      isOffline.value = false

      // Background: verify cached notes not confirmed by fresh API fetch
      if (cachedIds.length > 0) {
        const unverified = cachedIds.filter((id) => !freshIds.has(id))
        if (unverified.length > 0) {
          purgeStaleCachedNotes(adapter, unverified)
        }
      }
    } catch (e) {
      if (notes.value.length > 0) {
        // Cache is displayed — mark offline instead of showing error
        isOffline.value = true
      } else {
        // No notes loaded yet — try cache before showing error
        const column = config.getColumn()
        const cacheKey = config.cache?.getKey()
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
            if (cached.length > 0) {
              setNotes(cached)
              isOffline.value = true
            } else {
              error.value = AppError.from(e)
            }
          } catch {
            error.value = AppError.from(e)
          }
        } else {
          error.value = AppError.from(e)
        }
      }
    } finally {
      isLoading.value = false
    }
  }

  /** Helper to load older notes from SQLite cache */
  async function loadMoreFromCache() {
    const column = config.getColumn()
    const cacheKey = config.cache?.getKey()
    if (!column.accountId || !cacheKey) return
    const lastNote = notes.value.at(-1)
    if (!lastNote) return
    isLoading.value = true
    try {
      const older = await invoke<NormalizedNote[]>(
        'api_get_cached_timeline_before',
        {
          accountId: column.accountId,
          timelineType: cacheKey,
          before: lastNote.createdAt,
          limit: 40,
        },
      )
      if (older.length > 0) {
        setNotes(insertIntoSorted(notes.value, older))
      }
    } catch {
      /* cache read failure is non-critical */
    } finally {
      isLoading.value = false
    }
  }

  async function loadMore() {
    if (isLoading.value || notes.value.length === 0) return
    if (config.validate && !config.validate()) return

    // Offline: load from cache instead
    if (isOffline.value) {
      await loadMoreFromCache()
      return
    }

    const adapter = getAdapter()
    if (!adapter) return
    const lastNote = notes.value.at(-1)
    if (!lastNote) return
    isLoading.value = true
    try {
      const older = await config.fetch(adapter, { untilId: lastNote.id })
      setNotes(insertIntoSorted(notes.value, older))
    } catch {
      // API failed: try cache fallback
      isOffline.value = true
      await loadMoreFromCache()
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
        if (scroller.value) scroller.value.scrollTop = 0
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
          setNotes(insertIntoSorted(notes.value, result.notes))
          scrollToTop()
        }
      } else {
        const fetched = await config.fetch(adapter, {})
        setNotes(fetched)
        scrollToTop()
      }
      isOffline.value = false
    } catch (e) {
      if (notes.value.length > 0) {
        isOffline.value = true
      } else {
        error.value = AppError.from(e)
      }
    } finally {
      isLoading.value = false
    }
  }

  async function pullRefresh() {
    const adapter = getAdapter()
    if (!adapter) return
    if (config.validate && !config.validate()) return
    const sinceId = notes.value[0]?.id
    try {
      const fetched = await config.fetch(adapter, sinceId ? { sinceId } : {})
      if (sinceId && fetched.length > 0) {
        const newNotes = fetched.filter((n) => !noteIds.has(n.id))
        if (newNotes.length > 0) {
          setNotes(insertIntoSorted(notes.value, newNotes))
        }
      } else if (fetched.length > 0) {
        setNotes(fetched)
      }
      isOffline.value = false
    } catch {
      isOffline.value = true
    }
    scrollToTop()
  }

  const {
    isPulling,
    isPulledEnough,
    isRefreshing,
    pullDistance,
    displayHeight,
  } = usePullToRefresh(scroller, pullRefresh)

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

    let apiFailed = false
    const apiPromise = sinceId
      ? config.fetch(adapter, { sinceId }).catch(() => {
          apiFailed = true
          return [] as NormalizedNote[]
        })
      : Promise.resolve([] as NormalizedNote[])

    const [cached, fetched] = await Promise.all([cachePromise, apiPromise])
    isOffline.value = apiFailed

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
      setNotes(insertIntoSorted(notes.value, deduped))
    }

    // Background: verify cached notes not confirmed by fresh API fetch
    if (cached.length > 0 && adapter) {
      const freshIds = new Set(fetched.map((n) => n.id))
      const unverified = cached
        .map((n) => n.id)
        .filter((id) => !freshIds.has(id))
      if (unverified.length > 0) {
        purgeStaleCachedNotes(adapter, unverified)
      }
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

  // Ref for NoteScroller component — syncs its scroll container to the scroller ref
  const noteScrollerRef = ref<{ getElement: () => HTMLElement | null } | null>(
    null,
  )
  watch(
    noteScrollerRef,
    () => {
      scroller.value = noteScrollerRef.value?.getElement() ?? null
    },
    { flush: 'post' },
  )

  return {
    account,
    columnThemeVars,
    serverIconUrl,
    isLoading,
    isOffline,
    error,
    notes,
    focusedNoteId,
    pendingNotes,
    animateEnter,
    postForm,
    handlers,
    noteScrollerRef,
    scrollToTop,
    handleScroll,
    handlePosted,
    removeNote,
    refresh,
    isPulling,
    isPulledEnough,
    isRefreshing,
    pullDistance,
    displayHeight,
  }
}
