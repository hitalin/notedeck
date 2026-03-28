import type { Ref } from 'vue'
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
import {
  loadCachedTimeline,
  loadCachedTimelineBefore,
  purgeStaleCachedNotes,
  restoreSnapshot,
  saveSnapshot,
} from '@/composables/useNoteColumnCache'
import { useNoteFocus } from '@/composables/useNoteFocus'
import { useNoteList } from '@/composables/useNoteList'
import { useNoteScrollerRef } from '@/composables/useNoteScrollerRef'
import { useNoteSound } from '@/composables/useNoteSound'
import { usePullToRefresh } from '@/composables/usePullToRefresh'
import { useStreamingBatch } from '@/composables/useStreamingBatch'
import { isGuestAccount } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useOfflineModeStore } from '@/stores/offlineMode'
import { dedup } from '@/utils/dedup'
import { AppError } from '@/utils/errors'
import { logWarn } from '@/utils/logger'
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
  /** Filter cached notes after loading from SQLite (e.g. timeline column filters) */
  filterCachedNotes?: (notes: NormalizedNote[]) => NormalizedNote[]
  /**
   * When provided, delays `connect()` until this ref becomes `true`.
   * Used by timeline columns to wait for policy detection before connecting.
   */
  connectReady?: Ref<boolean>
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
    disposeSubscription,
    disconnect,
    postForm,
    handlers,
    scroller,
    onScrollReport,
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

  /** Load and filter cached timeline notes. Returns empty array on failure. */
  async function loadFilteredCache(label: string): Promise<NormalizedNote[]> {
    const column = config.getColumn()
    const cacheKey = config.cache?.getKey()
    if (!column.accountId || !cacheKey) return []
    try {
      const cached = await loadCachedTimeline(column.accountId, cacheKey)
      return applyFilter(cached)
    } catch (e) {
      logWarn(label, e)
      return []
    }
  }

  // Handle token state transitions (logout / re-login)
  watch(
    () => account.value?.hasToken,
    async (hasToken, prev) => {
      if (prev === true && hasToken === false) {
        // Logout: stop streaming, preserve displayed notes (freeze)
        disconnect()
      } else if (prev === false && hasToken === true) {
        // Re-login: reconnect with full authentication
        reconnect()
      }
    },
  )

  async function connect(useCache = false) {
    error.value = null

    if (config.validate && !config.validate()) {
      return
    }

    // Restore snapshot from a previously unmounted instance (instant re-mount)
    const colId = config.getColumn().id
    const snapshot = restoreSnapshot(colId)
    if (snapshot) {
      setNotes(snapshot.notes)
      const savedScrollTop = snapshot.scrollTop
      nextTick(() => {
        const el = noteScrollerRef.value?.getElement?.()
        if (el) el.scrollTop = savedScrollTop
      })
    }

    let cachedIds: string[] = []

    // Load cache when explicitly requested OR when account has no token
    const shouldLoadCache =
      (useCache || !account.value || !account.value.hasToken) && config.cache
    if (shouldLoadCache) {
      const filtered = await loadFilteredCache('load-cache')
      if (filtered.length > 0) {
        setNotes(filtered)
        cachedIds = filtered.map((n) => n.id)
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

    // App-level offline mode: skip API fetch and streaming, show cache only
    if (useOfflineModeStore().isOfflineMode) {
      isOffline.value = true
      isLoading.value = false
      return
    }

    // Logged-out account: show cached notes only, skip API fetch.
    // Guest accounts (never authenticated) still use anonymous API.
    if (!account.value.hasToken && !isGuestAccount(account.value)) {
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
      const currentColumn = config.getColumn()
      if (cachedIds.length > 0 && currentColumn.accountId) {
        const unverified = cachedIds.filter((id) => !freshIds.has(id))
        if (unverified.length > 0) {
          purgeStaleCachedNotes(
            adapter,
            unverified,
            () => !!getAdapter(),
            currentColumn.accountId,
          )
        }
      }
    } catch (e) {
      if (notes.value.length > 0) {
        // Cache is displayed — mark offline instead of showing error
        isOffline.value = true
      } else {
        // No notes loaded yet — try cache before showing error
        const filtered = await loadFilteredCache('fallback-cache')
        if (filtered.length > 0) {
          setNotes(filtered)
          isOffline.value = true
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
      const older = await loadCachedTimelineBefore(
        column.accountId,
        cacheKey,
        lastNote.createdAt,
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
    onScrollReport()
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
        ? loadFilteredCache('resume-cache')
        : Promise.resolve([] as NormalizedNote[])

    let apiFailed = false
    const apiPromise = sinceId
      ? config.fetch(adapter, { sinceId }).catch((e) => {
          logWarn('resume-api', e)
          apiFailed = true
          return [] as NormalizedNote[]
        })
      : Promise.resolve([] as NormalizedNote[])

    const [cached, fetched] = await Promise.all([cachePromise, apiPromise])
    isOffline.value = apiFailed

    // Merge results: API results take priority, then filtered cache
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
    const resumeColumn = config.getColumn()
    if (cached.length > 0 && adapter && resumeColumn.accountId) {
      const freshIds = new Set(fetched.map((n) => n.id))
      const unverified = cached
        .map((n) => n.id)
        .filter((id) => !freshIds.has(id))
      if (unverified.length > 0) {
        purgeStaleCachedNotes(
          adapter,
          unverified,
          () => !!getAdapter(),
          resumeColumn.accountId,
        )
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
    if (useOfflineModeStore().isOfflineMode) {
      // Offline mode: load cache only, skip API fetch and streaming
      setNotes([])
      isLoading.value = true
      if (useCache && config.cache) {
        const filtered = await loadFilteredCache('reconnect-cache')
        if (filtered.length > 0) setNotes(filtered)
      }
      isOffline.value = true
      isLoading.value = false
    } else if (adapter && config.streaming && streamingBatch) {
      // Stream-preserving path: reuse adapter/WebSocket, swap subscription only
      resubscribe(adapter)
      setNotes([])
      isLoading.value = true
      try {
        // Load cache if requested
        if (useCache && config.cache) {
          const filtered = await loadFilteredCache('reconnect-cache')
          if (filtered.length > 0) setNotes(filtered)
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
    if (config.connectReady && !config.connectReady.value) {
      // Delay connect until the parent signals readiness (e.g. policy detection)
      const stop = watch(config.connectReady, (ready) => {
        if (ready) {
          stop()
          connect(true)
        }
      })
    } else {
      connect(true)
    }
  })

  onUnmounted(() => {
    window.removeEventListener('deck-resume', onResume)
    // Save snapshot for instant restore if column is re-mounted
    if (notes.value.length > 0) {
      const el = noteScrollerRef.value?.getElement?.()
      saveSnapshot(config.getColumn().id, notes.value, el?.scrollTop ?? 0)
    }
    disconnect()
    streamingBatch?.resetBatch()
  })

  const { noteScrollerRef } = useNoteScrollerRef(scroller)

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
