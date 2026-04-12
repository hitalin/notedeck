import { listen } from '@tauri-apps/api/event'
import { commands, unwrap } from '@/utils/tauriInvoke'
import type {
  ChannelSubscription,
  ChatMessage,
  MainChannelEvent,
  NormalizedNote,
  NormalizedNotification,
  NoteUpdateEvent,
  RawStreamEvent,
  StreamAdapter,
  StreamConnectionState,
  TimelineType,
} from '../types'

/** Consolidated stream event from Rust TauriEmitter */
interface StreamEventEnvelope {
  kind: string
  payload: StreamEventPayload
}

/** Union of known payload shapes keyed by `kind` */
interface StreamEventPayload {
  accountId: string
  subscriptionId?: string
  state?: StreamConnectionState
  note?: NormalizedNote
  noteId?: string
  updateType?: NoteUpdateEvent['type']
  body?: NoteUpdateEvent['body']
  notification?: NormalizedNotification
  eventType?: string
  message?: ChatMessage
  messageId?: string
}

/**
 * Shared subscription pool entry.
 *
 * 複数カラムが同一の (channel type, params) を購読した場合、Rust 側の subscription は
 * 1 本に畳み込み、JS 側でハンドラを fan-out する。refcount が 0 になったら実購読を破棄。
 */
interface PoolEntry {
  refcount: number
  real: ChannelSubscription
  noteHandlers: Set<(note: NormalizedNote) => void>
  noteUpdateHandlers: Set<(event: NoteUpdateEvent) => void>
  mainHandlers: Set<(event: MainChannelEvent) => void>
  chatMessageHandlers: Set<(msg: ChatMessage) => void>
  chatDeletedHandlers: Set<(messageId: string) => void>
}

export class MisskeyStream implements StreamAdapter {
  private accountId: string
  private _state: StreamConnectionState = 'initializing'
  private eventHandlers = new Map<string, Set<() => void>>()

  // Centralized listeners (registered once in connect(), cleaned up in disconnect())
  private unlistenFns: (() => void)[] = []
  /** Incremented on each registerListeners() call; stale listeners check this to self-discard. */
  private _listenerGeneration = 0

  // Handler maps for O(1) dispatch by subscriptionId.
  // プール経由の購読では各 map のエントリは「プールエントリの fan-out ディスパッチャ」1 本のみ。
  private noteHandlers = new Map<string, (note: NormalizedNote) => void>()
  private noteUpdateHandlers = new Map<
    string,
    (event: NoteUpdateEvent) => void
  >()
  private notifHandlers = new Map<string, (event: MainChannelEvent) => void>()
  private mainHandlers = new Map<string, (event: MainChannelEvent) => void>()
  private mentionHandlers = new Map<string, (note: NormalizedNote) => void>()
  private chatMessageHandlers = new Map<string, (msg: ChatMessage) => void>()
  private chatDeletedHandlers = new Map<string, (messageId: string) => void>()
  private noteCaptureHandlers = new Map<
    string,
    (event: NoteUpdateEvent) => void
  >()
  private rawEventHandlers = new Set<(event: RawStreamEvent) => void>()

  // Pool keyed by canonical "channel:params" string
  private subscriptionPool = new Map<string, PoolEntry>()

  constructor(accountId: string) {
    this.accountId = accountId
  }

  get state(): StreamConnectionState {
    return this._state
  }

  connect(): void {
    this.registerListeners()

    commands
      .streamConnect(this.accountId)
      .then((result) => {
        unwrap(result)
        this._state = 'connected'
        this.emit('connected')
      })
      .catch((e) => {
        console.error('[stream] connect failed:', e)
        this._state = 'disconnected'
        this.emit('disconnected')
      })
  }

  reconnect(): void {
    // Remove potentially stale listeners (may have been lost during background suspension)
    for (const fn of this.unlistenFns) fn()
    this.unlistenFns = []

    // Re-register fresh listeners (handler maps are preserved)
    this.registerListeners()

    // Ensure Rust-side connection is alive (idempotent — returns Ok if already connected)
    commands
      .streamConnect(this.accountId)
      .then((result) => {
        unwrap(result)
        this._state = 'connected'
        this.emit('connected')
      })
      .catch((e) => {
        // Connection might be reconnecting on Rust side — that's fine
        if (import.meta.env.DEV) console.debug('[stream] reconnect ignored:', e)
      })
  }

  private registerListeners(): void {
    // Bump generation so any in-flight listen() from a previous call will self-discard
    const gen = ++this._listenerGeneration

    listen<StreamEventEnvelope>('stream-event', (event) => {
      // Stale listener guard: if a newer registerListeners() has been called,
      // this callback belongs to a superseded generation — ignore it.
      if (gen !== this._listenerGeneration) return

      const { kind, payload: p } = event.payload
      if (p.accountId !== this.accountId) return

      // Emit raw envelope to inspector subscribers before dispatch
      if (this.rawEventHandlers.size > 0) {
        const raw: RawStreamEvent = {
          kind,
          payload: p as unknown as Record<string, unknown>,
        }
        for (const h of this.rawEventHandlers) h(raw)
      }

      switch (kind) {
        case 'stream-status':
          if (p.state) {
            this._state = p.state
            this.emit(p.state)
          }
          break
        case 'stream-note':
          if (p.subscriptionId && p.note) {
            this.noteHandlers.get(p.subscriptionId)?.(p.note)
          }
          break
        case 'stream-note-updated':
          if (p.subscriptionId && p.noteId && p.updateType && p.body) {
            this.noteUpdateHandlers.get(p.subscriptionId)?.({
              noteId: p.noteId,
              type: p.updateType,
              body: p.body,
            })
          }
          break
        case 'stream-notification':
          if (p.subscriptionId && p.notification) {
            this.notifHandlers.get(p.subscriptionId)?.({
              type: 'notification',
              body: p.notification,
            })
          }
          break
        case 'stream-mention':
          if (p.subscriptionId && p.note) {
            this.mentionHandlers.get(p.subscriptionId)?.(p.note)
          }
          break
        case 'stream-main-event':
          if (p.subscriptionId && p.eventType) {
            this.mainHandlers.get(p.subscriptionId)?.({
              type: p.eventType,
              body: p.body,
            })
          }
          break
        case 'stream-note-capture-updated':
          if (p.noteId && p.updateType && p.body) {
            this.noteCaptureHandlers.get(p.noteId)?.({
              noteId: p.noteId,
              type: p.updateType,
              body: p.body,
            })
          }
          break
        case 'stream-chat-message':
          if (p.subscriptionId && p.message) {
            this.chatMessageHandlers.get(p.subscriptionId)?.(p.message)
          }
          break
        case 'stream-chat-message-deleted':
          if (p.subscriptionId && p.messageId) {
            this.chatDeletedHandlers.get(p.subscriptionId)?.(p.messageId)
          }
          break
      }
    })
      .then((fn) => {
        if (gen !== this._listenerGeneration) {
          // This listener was superseded before its Promise resolved — unlisten immediately
          fn()
          return
        }
        this.unlistenFns.push(fn)
      })
      .catch((e) => console.error('[stream] failed to listen stream-event:', e))
  }

  cleanup(): void {
    // Invalidate any in-flight listen() Promises so their callbacks become no-ops
    this._listenerGeneration++
    for (const fn of this.unlistenFns) fn()
    this.unlistenFns = []
    this.noteHandlers.clear()
    this.noteUpdateHandlers.clear()
    this.notifHandlers.clear()
    this.mainHandlers.clear()
    this.chatMessageHandlers.clear()
    this.chatDeletedHandlers.clear()
    this.noteCaptureHandlers.clear()
    this.eventHandlers.clear()
    // プール内の実 subscription も破棄（念のため）。handler set は entry ごと破棄される。
    for (const entry of this.subscriptionPool.values()) {
      entry.real.dispose()
    }
    this.subscriptionPool.clear()
    this._state = 'disconnected'
  }

  disconnect(): void {
    this.cleanup()
    commands.streamDisconnect(this.accountId).catch((e) => {
      console.warn('[stream] disconnect failed:', e)
    })
    this.emit('disconnected')
  }

  /**
   * プール済みエントリを取得。既存があれば refcount をインクリメント、なければ作成。
   * createReal は新規作成時のみ呼ばれる。
   */
  private acquirePool(
    key: string,
    createReal: (entry: PoolEntry) => ChannelSubscription,
  ): PoolEntry {
    const existing = this.subscriptionPool.get(key)
    if (existing) {
      existing.refcount++
      return existing
    }
    const entry: PoolEntry = {
      refcount: 1,
      // 実 subscription はこの後 createReal で差し込まれる
      real: undefined as unknown as ChannelSubscription,
      noteHandlers: new Set(),
      noteUpdateHandlers: new Set(),
      mainHandlers: new Set(),
      chatMessageHandlers: new Set(),
      chatDeletedHandlers: new Set(),
    }
    this.subscriptionPool.set(key, entry)
    entry.real = createReal(entry)
    return entry
  }

  /**
   * プールエントリへの参照を解放。refcount が 0 になったら実 subscription を破棄。
   */
  private releasePool(
    key: string,
    entry: PoolEntry,
    removeHandlers: () => void,
  ): ChannelSubscription {
    let disposed = false
    return {
      dispose: () => {
        if (disposed) return
        disposed = true
        removeHandlers()
        entry.refcount--
        if (entry.refcount <= 0 && this.subscriptionPool.get(key) === entry) {
          this.subscriptionPool.delete(key)
          entry.real.dispose()
        }
      },
    }
  }

  private createSubscription(
    subscribe: () => Promise<string>,
    register: (id: string) => void,
    unregister: (id: string) => void,
  ): ChannelSubscription {
    let subscriptionId: string | null = null
    let disposed = false

    const subscribePromise = subscribe()
      .then((id) => {
        if (disposed) {
          commands.streamUnsubscribe(this.accountId, id).catch((e) => {
            if (import.meta.env.DEV)
              console.debug('[stream] late unsubscribe ignored:', e)
          })
          return null
        }
        subscriptionId = id
        register(id)
        return id
      })
      .catch((e) => {
        console.error('[stream] subscribe failed:', e)
        return null
      })

    return {
      dispose: () => {
        disposed = true
        if (subscriptionId) {
          unregister(subscriptionId)
          commands
            .streamUnsubscribe(this.accountId, subscriptionId)
            .catch((e) => {
              console.warn('[stream] unsubscribe failed:', e)
            })
        } else {
          subscribePromise.then((id) => {
            if (id) {
              unregister(id)
              commands.streamUnsubscribe(this.accountId, id).catch((e) => {
                console.warn('[stream] unsubscribe failed:', e)
              })
            }
          })
        }
      },
    }
  }

  /** 同種のノート購読で共有する register/unregister 登録ロジック */
  private registerNoteDispatcher(entry: PoolEntry) {
    return {
      register: (id: string) => {
        this.noteHandlers.set(id, (note) => {
          for (const h of entry.noteHandlers) h(note)
        })
        this.noteUpdateHandlers.set(id, (ev) => {
          for (const h of entry.noteUpdateHandlers) h(ev)
        })
      },
      unregister: (id: string) => {
        this.noteHandlers.delete(id)
        this.noteUpdateHandlers.delete(id)
      },
    }
  }

  private registerChatDispatcher(entry: PoolEntry) {
    return {
      register: (id: string) => {
        this.chatMessageHandlers.set(id, (msg) => {
          for (const h of entry.chatMessageHandlers) h(msg)
        })
        this.chatDeletedHandlers.set(id, (mid) => {
          for (const h of entry.chatDeletedHandlers) h(mid)
        })
      },
      unregister: (id: string) => {
        this.chatMessageHandlers.delete(id)
        this.chatDeletedHandlers.delete(id)
      },
    }
  }

  subscribeTimeline(
    type: TimelineType,
    handler: (note: NormalizedNote) => void,
    options?: {
      onNoteUpdated?: (event: NoteUpdateEvent) => void
      listId?: string
    },
  ): ChannelSubscription {
    const key = `tl:${type}:${options?.listId ?? ''}`
    const entry = this.acquirePool(key, (e) => {
      const d = this.registerNoteDispatcher(e)
      return this.createSubscription(
        async () =>
          unwrap(
            await commands.streamConnectAndSubscribeTimeline(
              this.accountId,
              type,
              options?.listId ?? null,
            ),
          ),
        d.register,
        d.unregister,
      )
    })
    entry.noteHandlers.add(handler)
    const onUpdated = options?.onNoteUpdated
    if (onUpdated) entry.noteUpdateHandlers.add(onUpdated)
    return this.releasePool(key, entry, () => {
      entry.noteHandlers.delete(handler)
      if (onUpdated) entry.noteUpdateHandlers.delete(onUpdated)
    })
  }

  subscribeAntenna(
    antennaId: string,
    handler: (note: NormalizedNote) => void,
    options?: { onNoteUpdated?: (event: NoteUpdateEvent) => void },
  ): ChannelSubscription {
    const key = `an:${antennaId}`
    const entry = this.acquirePool(key, (e) => {
      const d = this.registerNoteDispatcher(e)
      return this.createSubscription(
        async () =>
          unwrap(
            await commands.streamConnectAndSubscribeAntenna(
              this.accountId,
              antennaId,
            ),
          ),
        d.register,
        d.unregister,
      )
    })
    entry.noteHandlers.add(handler)
    const onUpdated = options?.onNoteUpdated
    if (onUpdated) entry.noteUpdateHandlers.add(onUpdated)
    return this.releasePool(key, entry, () => {
      entry.noteHandlers.delete(handler)
      if (onUpdated) entry.noteUpdateHandlers.delete(onUpdated)
    })
  }

  subscribeChannel(
    channelId: string,
    handler: (note: NormalizedNote) => void,
    options?: { onNoteUpdated?: (event: NoteUpdateEvent) => void },
  ): ChannelSubscription {
    const key = `ch:${channelId}`
    const entry = this.acquirePool(key, (e) => {
      const d = this.registerNoteDispatcher(e)
      return this.createSubscription(
        async () =>
          unwrap(
            await commands.streamConnectAndSubscribeChannel(
              this.accountId,
              channelId,
            ),
          ),
        d.register,
        d.unregister,
      )
    })
    entry.noteHandlers.add(handler)
    const onUpdated = options?.onNoteUpdated
    if (onUpdated) entry.noteUpdateHandlers.add(onUpdated)
    return this.releasePool(key, entry, () => {
      entry.noteHandlers.delete(handler)
      if (onUpdated) entry.noteUpdateHandlers.delete(onUpdated)
    })
  }

  subscribeMain(
    handler: (event: MainChannelEvent) => void,
  ): ChannelSubscription {
    const key = 'main'
    const entry = this.acquirePool(key, (e) =>
      this.createSubscription(
        async () => unwrap(await commands.streamSubscribeMain(this.accountId)),
        (id) => {
          const dispatch = (event: MainChannelEvent) => {
            for (const h of e.mainHandlers) h(event)
          }
          this.notifHandlers.set(id, dispatch)
          this.mainHandlers.set(id, dispatch)
        },
        (id) => {
          this.notifHandlers.delete(id)
          this.mainHandlers.delete(id)
        },
      ),
    )
    entry.mainHandlers.add(handler)
    return this.releasePool(key, entry, () => {
      entry.mainHandlers.delete(handler)
    })
  }

  subscribeMentions(
    handler: (note: NormalizedNote) => void,
    options?: { onNoteUpdated?: (event: NoteUpdateEvent) => void },
  ): ChannelSubscription {
    const key = 'mentions'
    const entry = this.acquirePool(key, (e) =>
      this.createSubscription(
        async () => unwrap(await commands.streamSubscribeMain(this.accountId)),
        (id) => {
          this.mentionHandlers.set(id, (note) => {
            for (const h of e.noteHandlers) h(note)
          })
          this.noteUpdateHandlers.set(id, (ev) => {
            for (const h of e.noteUpdateHandlers) h(ev)
          })
        },
        (id) => {
          this.mentionHandlers.delete(id)
          this.noteUpdateHandlers.delete(id)
        },
      ),
    )
    entry.noteHandlers.add(handler)
    const onUpdated = options?.onNoteUpdated
    if (onUpdated) entry.noteUpdateHandlers.add(onUpdated)
    return this.releasePool(key, entry, () => {
      entry.noteHandlers.delete(handler)
      if (onUpdated) entry.noteUpdateHandlers.delete(onUpdated)
    })
  }

  subscribeChatUser(
    otherId: string,
    handler: (msg: ChatMessage) => void,
    options?: { onDeleted?: (messageId: string) => void },
  ): ChannelSubscription {
    const key = `cu:${otherId}`
    const entry = this.acquirePool(key, (e) => {
      const d = this.registerChatDispatcher(e)
      return this.createSubscription(
        async () =>
          unwrap(
            await commands.streamSubscribeChatUser(this.accountId, otherId),
          ),
        d.register,
        d.unregister,
      )
    })
    entry.chatMessageHandlers.add(handler)
    const onDeleted = options?.onDeleted
    if (onDeleted) entry.chatDeletedHandlers.add(onDeleted)
    return this.releasePool(key, entry, () => {
      entry.chatMessageHandlers.delete(handler)
      if (onDeleted) entry.chatDeletedHandlers.delete(onDeleted)
    })
  }

  subscribeChatRoom(
    roomId: string,
    handler: (msg: ChatMessage) => void,
    options?: { onDeleted?: (messageId: string) => void },
  ): ChannelSubscription {
    const key = `cr:${roomId}`
    const entry = this.acquirePool(key, (e) => {
      const d = this.registerChatDispatcher(e)
      return this.createSubscription(
        async () =>
          unwrap(
            await commands.streamSubscribeChatRoom(this.accountId, roomId),
          ),
        d.register,
        d.unregister,
      )
    })
    entry.chatMessageHandlers.add(handler)
    const onDeleted = options?.onDeleted
    if (onDeleted) entry.chatDeletedHandlers.add(onDeleted)
    return this.releasePool(key, entry, () => {
      entry.chatMessageHandlers.delete(handler)
      if (onDeleted) entry.chatDeletedHandlers.delete(onDeleted)
    })
  }

  subNote(noteId: string, handler: (event: NoteUpdateEvent) => void): void {
    this.noteCaptureHandlers.set(noteId, handler)
    commands.streamSubNote(this.accountId, noteId).catch((e) => {
      console.warn('[stream] subNote failed:', e)
    })
  }

  unsubNote(noteId: string): void {
    this.noteCaptureHandlers.delete(noteId)
    commands.streamUnsubNote(this.accountId, noteId).catch((e) => {
      console.warn('[stream] unsubNote failed:', e)
    })
  }

  on(
    event: 'connected' | 'disconnected' | 'reconnecting',
    handler: () => void,
  ): void {
    const set = this.eventHandlers.get(event) ?? new Set()
    set.add(handler)
    this.eventHandlers.set(event, set)
  }

  off(event: string, handler: () => void): void {
    this.eventHandlers.get(event)?.delete(handler)
  }

  onRawEvent(handler: (event: RawStreamEvent) => void): void {
    this.rawEventHandlers.add(handler)
  }

  offRawEvent(handler: (event: RawStreamEvent) => void): void {
    this.rawEventHandlers.delete(handler)
  }

  private emit(event: string): void {
    for (const handler of this.eventHandlers.get(event) ?? []) {
      handler()
    }
  }
}
