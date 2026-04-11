import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { initAdapterFor } from '@/adapters/initAdapter'
import type { RawStreamEvent } from '@/adapters/types'
import { getAccountAvatarUrl, useAccountsStore } from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { proxyThumbUrl } from '@/utils/imageProxy'

interface BadgePair {
  avatar: string | null
  serverIcon: string | null
}

export interface StreamEventEntry {
  id: number
  ts: number
  kind: string
  observer: BadgePair
  subject: BadgePair | null
  payload: Record<string, unknown>
}

const MAX_BUFFER = 500

export const ALL_KINDS = [
  'stream-note',
  'stream-notification',
  'stream-main-event',
  'stream-note-updated',
  'stream-mention',
  'stream-chat-message',
] as const

export const KIND_LABELS: Record<string, string> = {
  'stream-note': 'note',
  'stream-notification': 'notif',
  'stream-main-event': 'main',
  'stream-note-updated': 'updated',
  'stream-mention': 'mention',
  'stream-chat-message': 'chat',
}

export const useStreamInspectorStore = defineStore('streamInspector', () => {
  const accountsStore = useAccountsStore()
  const serversStore = useServersStore()

  // --- Buffer ---
  let nextId = 0
  const buffer = shallowRef<StreamEventEntry[]>([])
  const paused = ref(false)
  const selectedId = ref<number | null>(null)
  const enabledKinds = ref(new Set<string>(ALL_KINDS))

  const selectedEntry = computed(() => {
    if (selectedId.value == null) return null
    return buffer.value.find((e) => e.id === selectedId.value) ?? null
  })

  const selectedJson = computed(() => {
    if (!selectedEntry.value) return ''
    return JSON.stringify(
      { kind: selectedEntry.value.kind, payload: selectedEntry.value.payload },
      null,
      2,
    )
  })

  // --- Dedup ---
  let lastEventKey = ''
  let lastEventTs = 0
  const DEDUP_WINDOW_MS = 50

  // --- Subscription management ---
  type CleanupFn = () => void
  const cleanups: CleanupFn[] = []
  let capturing = false

  function extractSubject(p: Record<string, unknown>): BadgePair | null {
    const src =
      (p.note as Record<string, unknown> | undefined)?.user ??
      (p.notification as Record<string, unknown> | undefined)?.user ??
      null
    if (!src || typeof src !== 'object') return null
    const u = src as Record<string, unknown>
    const avatarUrl = typeof u.avatarUrl === 'string' ? u.avatarUrl : null
    const host = typeof u.host === 'string' ? u.host : null
    return {
      avatar: avatarUrl ? (proxyThumbUrl(avatarUrl, 28) ?? avatarUrl) : null,
      serverIcon: host
        ? (serversStore.getServer(host)?.iconUrl ??
          `https://${host}/favicon.ico`)
        : null,
    }
  }

  function makeRawHandler(observer: BadgePair, accountId: string) {
    return (event: RawStreamEvent) => {
      if (paused.value) return
      if (!enabledKinds.value.has(event.kind)) return
      const now = Date.now()
      const key = `${event.kind}:${event.payload.subscriptionId ?? ''}:${accountId}`
      if (key === lastEventKey && now - lastEventTs < DEDUP_WINDOW_MS) return
      lastEventKey = key
      lastEventTs = now
      const entry: StreamEventEntry = {
        id: nextId++,
        ts: now,
        kind: event.kind,
        observer,
        subject: extractSubject(event.payload),
        payload: event.payload,
      }
      const arr = [entry, ...buffer.value]
      if (arr.length > MAX_BUFFER) arr.length = MAX_BUFFER
      buffer.value = arr
    }
  }

  async function subscribeAll() {
    for (const fn of cleanups) fn()
    cleanups.length = 0

    const accounts = accountsStore.accounts.filter((a) => a.hasToken)
    for (const acc of accounts) {
      const { adapter } = await initAdapterFor(acc.host, acc.id)
      const observerBadge: BadgePair = {
        avatar:
          proxyThumbUrl(getAccountAvatarUrl(acc), 28) ??
          getAccountAvatarUrl(acc),
        serverIcon:
          serversStore.getServer(acc.host)?.iconUrl ??
          `https://${acc.host}/favicon.ico`,
      }
      const handler = makeRawHandler(observerBadge, acc.id)
      adapter.stream.onRawEvent(handler)
      cleanups.push(() => adapter.stream.offRawEvent(handler))
    }
  }

  function unsubscribeAll() {
    for (const fn of cleanups) fn()
    cleanups.length = 0
  }

  // --- Public actions ---

  function toggleKind(kind: string) {
    const s = new Set(enabledKinds.value)
    if (s.has(kind)) s.delete(kind)
    else s.add(kind)
    enabledKinds.value = s
  }

  function selectRow(id: number) {
    selectedId.value = id
  }

  function clearBuffer() {
    buffer.value = []
    selectedId.value = null
  }

  /**
   * Watch deck columns for streamInspector existence.
   * Call once from an always-mounted component (e.g. DeckLayout).
   */
  function startWatching() {
    const deckStore = useDeckStore()

    const hasInspector = computed(() =>
      deckStore.columns.some((c) => c.type === 'streamInspector'),
    )

    // Start/stop capture based on column existence
    watch(
      hasInspector,
      (has) => {
        if (has && !capturing) {
          capturing = true
          subscribeAll()
        } else if (!has && capturing) {
          capturing = false
          unsubscribeAll()
          buffer.value = []
          selectedId.value = null
        }
      },
      { immediate: true },
    )

    // Re-subscribe when accounts change (while capturing)
    watch(
      () => accountsStore.accounts.length,
      () => {
        if (capturing) subscribeAll()
      },
    )
  }

  return {
    buffer,
    paused,
    selectedId,
    selectedEntry,
    selectedJson,
    enabledKinds,
    toggleKind,
    selectRow,
    clearBuffer,
    startWatching,
  }
})
