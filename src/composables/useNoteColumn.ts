import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
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
import { catchLog, logWarn } from '@/utils/logger'
import { insertIntoSorted } from '@/utils/sortNotes'
import { invoke } from '@/utils/tauriInvoke'

/** Snapshots of unmounted columns for instant restore on re-mount */
interface ColumnSnapshot {
  notes: NormalizedNote[]
  scrollTop: number
  savedAt: number
}
const columnSnapshots = new Map<string, ColumnSnapshot>()
const SNAPSHOT_TTL = 5 * 60_000 // 5 minutes

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
  /** Filter cached notes after loading from SQLite (e.g. timeline column filters) */
  filterCachedNotes?: (notes: NormalizedNote[]) => NormalizedNote[]
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
    disposeSubscription,
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
    mergeIfSameList,
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
    { ...handlers, delete: removeNote, edit: handlers.edit },
    (note) => navigateToNote(note._accountId, note.id),
    undefined,
    (index) => noteScrollerRef.value?.scrollToIndex(index),
  )

  const pendingNotes =
    streamingBatch?.pendingNotes ?? shallowRef<NormalizedNote[]>([])
  const animatingIds =
    streamingBatch?.animatingIds ?? shallowRef<ReadonlySet<string>>(new Set())

  /** True when API is unreachable and displaying cached notes */
  const isOffline = ref(false)

  /** True when the account exists but has no auth token */
  const isLoggedOut = computed(() => account.value?.hasToken === false)

  /** Apply filterCachedNotes if configured */
  function applyFilter(cached: NormalizedNote[]): NormalizedNote[] {
    return config.filterCachedNotes ? config.filterCachedNotes(cached) : cached
  }

  // Handle token state transitions (logout / re-login)
  watch(
    () => account.value?.hasToken,
    async (hasToken, prev) => {
      if (prev === true && hasToken === false) {
        // Logout: switch to anonymous API for public timelines
        disconnect()
        connect(true)
      } else if (prev === false && hasToken === true) {
        // Re-login: reconnect with full authentication
        reconnect()
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
            invoke('api_delete_cached_note', { noteId: id }).catch(
              catchLog('delete-cached-note'),
            )
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

    // Restore snapshot from a previously unmounted instance (instant re-mount)
    const colId = config.getColumn().id
    const snapshot = columnSnapshots.get(colId)
    if (snapshot && Date.now() - snapshot.savedAt < SNAPSHOT_TTL) {
      columnSnapshots.delete(colId)
      setNotes(snapshot.notes)
      const savedScrollTop = snapshot.scrollTop
      nextTick(() => {
        const el = noteScrollerRef.value?.getElement?.()
        if (el) el.scrollTop = savedScrollTop
      })
    } else {
      columnSnapshots.delete(colId)
    }

    let cachedIds: string[] = []

    // Load cache when explicitly requested OR when account has no token
    const shouldLoadCache =
      (useCache || !account.value || !account.value.hasToken) && config.cache
    if (shouldLoadCache) {
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
          const filtered = applyFilter(cached)
          if (filtered.length > 0) {
            setNotes(filtered)
            cachedIds = filtered.map((n) => n.id)
            window.dispatchEvent(new Event('nd:column-ready'))
          }
        } catch (e) {
          logWarn('load-cache', e)
        }
      }
    }

    // Only show skeleton if no cached notes are available
    if (notes.value.length === 0) {
      isLoading.value = true
    }

    // Unresolved account: show cached notes in read-only mode
    if (!account.value) {
      isOffline.value = true
      isLoading.value = false
      return
    }

    try {
      const adapter = await initAdapter({ hasToken: account.value.hasToken })
      if (!adapter) return

      // Start streaming setup early (runs in parallel with API fetch below).
      // Combined commands handle connect + subscribe in a single IPC round-trip.
      // Skip streaming for logged-out/guest accounts.
      if (account.value.hasToken && config.streaming && streamingBatch) {
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

      // When displaying cached notes, fetch full list to refresh stale data
      // (cache may lack avatarUrl, reactionEmojis, etc.)
      const hasCached = cachedIds.length > 0
      const sinceId =
        !hasCached && notes.value.length > 0 ? notes.value[0]?.id : undefined
      const dedupKey = `${config.getColumn().accountId}:${config.cache?.getKey() ?? 'default'}`
      const fetched = await dedup(dedupKey, () =>
        config.fetch(adapter, sinceId ? { sinceId } : {}),
      )
      const freshIds = new Set(fetched.map((n) => n.id))

      if (fetched.length > 0) {
        if (hasCached) {
          // Refresh cached note data with fresh API response
          if (!mergeIfSameList(fetched)) setNotes(fetched)
        } else if (sinceId) {
          const newNotes = fetched.filter((n) => !noteIds.has(n.id))
          if (newNotes.length > 0)
            setNotes(insertIntoSorted(notes.value, newNotes))
        } else {
          setNotes(fetched)
        }
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
            const filtered = applyFilter(cached)
            if (filtered.length > 0) {
              setNotes(filtered)
              isOffline.value = true
            } else {
              error.value = AppError.from(e)
            }
          } catch (cacheErr) {
            logWarn('fallback-cache', cacheErr)
            error.value = AppError.from(e)
          }
        } else {
          error.value = AppError.from(e)
        }
      }
    } finally {
      isLoading.value = false
      if (notes.value.length > 0) {
        window.dispatchEvent(new Event('nd:column-ready'))
      }
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
      const filtered = applyFilter(older)
      if (filtered.length > 0) {
        setNotes(insertIntoSorted(notes.value, filtered))
      }
    } catch (e) {
      logWarn('load-more-cache', e)
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
    } catch (e) {
      logWarn('load-more', e)
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
    } catch (e) {
      logWarn('pull-refresh', e)
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
            } catch (e) {
              logWarn('resume-cache', e)
              return []
            }
          })()
        : Promise.resolve([] as NormalizedNote[])

    let apiFailed = false
    const apiPromise = sinceId
      ? config.fetch(adapter, { sinceId }).catch((e) => {
          logWarn('resume-api', e)
          apiFailed = true
          return [] as NormalizedNote[]
        })
      : Promise.resolve([] as NormalizedNote[])

    const [rawCached, fetched] = await Promise.all([cachePromise, apiPromise])
    isOffline.value = apiFailed

    // Merge results: API results take priority, then filtered cache
    const cached = applyFilter(rawCached)
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

  /**
   * Re-subscribe to streaming channel without destroying the adapter/stream.
   * Reuses the existing WebSocket connection — only the channel subscription changes.
   */
  function resubscribe(adapter: ServerAdapter) {
    if (!config.streaming || !streamingBatch) return
    disposeSubscription()
    streamingBatch.resetBatch()
    setSubscription(
      config.streaming.subscribe(adapter, streamingBatch.enqueueNote, {
        onNoteUpdated: (event) => {
          if (event.type === 'deleted')
            streamingBatch.removePending(event.noteId)
          onNoteUpdate(event)
        },
      }),
    )
  }

  /** Disconnect, reset, and reconnect with fresh config state */
  async function reconnect(useCache = false) {
    const adapter = getAdapter()
    if (adapter && config.streaming && streamingBatch) {
      // Stream-preserving path: reuse adapter/WebSocket, swap subscription only
      resubscribe(adapter)
      setNotes([])
      isLoading.value = true
      try {
        // Load cache if requested
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
              const filtered = applyFilter(cached)
              if (filtered.length > 0) setNotes(filtered)
            } catch (e) {
              logWarn('reconnect-cache', e)
            }
          }
        }
        // Fetch latest from API
        const dedupKey = `${config.getColumn().accountId}:${config.cache?.getKey() ?? 'default'}`
        const fetched = await dedup(dedupKey, () => config.fetch(adapter, {}))
        if (fetched.length > 0) {
          if (!mergeIfSameList(fetched)) setNotes(fetched)
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
    } else {
      // Full reconnect: no adapter yet (initial connection, logged-out, etc.)
      disconnect()
      streamingBatch?.resetBatch()
      setNotes([])
      await connect(useCache)
    }
  }

  /** Switch tab with pre-loaded snapshot — swaps subscription without touching stream */
  async function switchWithSnapshot(
    snapshotNotes: NormalizedNote[],
    scrollTop: number,
  ) {
    const adapter = getAdapter()
    if (!adapter || !config.streaming || !streamingBatch) {
      // Fallback to full reconnect if no adapter
      await reconnect()
      return
    }

    // Swap subscription (stream/WebSocket stays connected)
    resubscribe(adapter)
    setNotes(snapshotNotes)
    await nextTick()
    if (scroller.value) scroller.value.scrollTop = scrollTop

    // Fetch diff from API to update snapshot with latest data
    const sinceId = snapshotNotes[0]?.id
    try {
      const dedupKey = `${config.getColumn().accountId}:${config.cache?.getKey() ?? 'default'}`
      const fetched = await dedup(dedupKey, () =>
        config.fetch(adapter, sinceId ? { sinceId } : {}),
      )
      if (fetched.length > 0) {
        const newNotes = fetched.filter((n) => !noteIds.has(n.id))
        if (newNotes.length > 0) {
          setNotes(insertIntoSorted(notes.value, newNotes))
        }
      }
      isOffline.value = false
    } catch {
      // API failure with snapshot displayed — mark offline
      isOffline.value = true
    }
  }

  onMounted(() => {
    window.addEventListener('deck-resume', onResume)
    connect(true)
  })

  onUnmounted(() => {
    window.removeEventListener('deck-resume', onResume)
    // Save snapshot for instant restore if column is re-mounted
    const colId = config.getColumn().id
    if (notes.value.length > 0) {
      const el = noteScrollerRef.value?.getElement?.()
      columnSnapshots.set(colId, {
        notes: notes.value.slice(0, 40),
        scrollTop: el?.scrollTop ?? 0,
        savedAt: Date.now(),
      })
    }
    disconnect()
    streamingBatch?.resetBatch()
  })

  // Ref for NoteScroller component — syncs its scroll container to the scroller ref
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

  return {
    account,
    columnThemeVars,
    serverIconUrl,
    isLoading,
    isOffline,
    isLoggedOut,
    error,
    notes,
    focusedNoteId,
    pendingNotes,
    animatingIds,
    postForm,
    handlers,
    noteScrollerRef,
    scroller,
    scrollToTop,
    handleScroll,
    handlePosted,
    removeNote,
    loadMore,
    refresh,
    isPulling,
    isPulledEnough,
    isRefreshing,
    pullDistance,
    displayHeight,
    // Low-level API for columns needing direct control (e.g. timeline type switching, time machine)
    connect,
    disconnect,
    reconnect,
    switchWithSnapshot,
    setNotes,
  }
}
