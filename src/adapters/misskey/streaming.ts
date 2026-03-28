import { listen } from '@tauri-apps/api/event'
import { invoke } from '@/utils/tauriInvoke'
import type {
  ChannelSubscription,
  ChatMessage,
  MainChannelEvent,
  NormalizedNote,
  NormalizedNotification,
  NoteUpdateEvent,
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

export class MisskeyStream implements StreamAdapter {
  private accountId: string
  private _state: StreamConnectionState = 'initializing'
  private eventHandlers = new Map<string, Set<() => void>>()

  // Centralized listeners (registered once in connect(), cleaned up in disconnect())
  private unlistenFns: (() => void)[] = []
  /** Incremented on each registerListeners() call; stale listeners check this to self-discard. */
  private _listenerGeneration = 0

  // Handler maps for O(1) dispatch by subscriptionId
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

  constructor(accountId: string) {
    this.accountId = accountId
  }

  get state(): StreamConnectionState {
    return this._state
  }

  connect(): void {
    this.registerListeners()

    invoke('stream_connect', { accountId: this.accountId })
      .then(() => {
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
    invoke('stream_connect', { accountId: this.accountId })
      .then(() => {
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
    this._state = 'disconnected'
  }

  disconnect(): void {
    this.cleanup()
    invoke('stream_disconnect', { accountId: this.accountId }).catch((e) => {
      console.warn('[stream] disconnect failed:', e)
    })
    this.emit('disconnected')
  }

  private createSubscription(
    command: string,
    args: Record<string, unknown>,
    register: (id: string) => void,
    unregister: (id: string) => void,
  ): ChannelSubscription {
    let subscriptionId: string | null = null
    let disposed = false

    const subscribePromise = invoke<string>(command, {
      accountId: this.accountId,
      ...args,
    })
      .then((id) => {
        if (disposed) {
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId: id,
          }).catch((e) => {
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
        console.error(`[stream] ${command} failed:`, e)
        return null
      })

    return {
      dispose: () => {
        disposed = true
        if (subscriptionId) {
          unregister(subscriptionId)
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId,
          }).catch((e) => {
            console.warn('[stream] unsubscribe failed:', e)
          })
        } else {
          subscribePromise.then((id) => {
            if (id) {
              unregister(id)
              invoke('stream_unsubscribe', {
                accountId: this.accountId,
                subscriptionId: id,
              }).catch((e) => {
                console.warn('[stream] unsubscribe failed:', e)
              })
            }
          })
        }
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
    return this.createSubscription(
      'stream_connect_and_subscribe_timeline',
      { timelineType: type, listId: options?.listId ?? null },
      (id) => {
        this.noteHandlers.set(id, handler)
        if (options?.onNoteUpdated)
          this.noteUpdateHandlers.set(id, options.onNoteUpdated)
      },
      (id) => {
        this.noteHandlers.delete(id)
        this.noteUpdateHandlers.delete(id)
      },
    )
  }

  subscribeAntenna(
    antennaId: string,
    handler: (note: NormalizedNote) => void,
    options?: { onNoteUpdated?: (event: NoteUpdateEvent) => void },
  ): ChannelSubscription {
    return this.createSubscription(
      'stream_connect_and_subscribe_antenna',
      { antennaId },
      (id) => {
        this.noteHandlers.set(id, handler)
        if (options?.onNoteUpdated)
          this.noteUpdateHandlers.set(id, options.onNoteUpdated)
      },
      (id) => {
        this.noteHandlers.delete(id)
        this.noteUpdateHandlers.delete(id)
      },
    )
  }

  subscribeChannel(
    channelId: string,
    handler: (note: NormalizedNote) => void,
    options?: { onNoteUpdated?: (event: NoteUpdateEvent) => void },
  ): ChannelSubscription {
    return this.createSubscription(
      'stream_connect_and_subscribe_channel',
      { channelId },
      (id) => {
        this.noteHandlers.set(id, handler)
        if (options?.onNoteUpdated)
          this.noteUpdateHandlers.set(id, options.onNoteUpdated)
      },
      (id) => {
        this.noteHandlers.delete(id)
        this.noteUpdateHandlers.delete(id)
      },
    )
  }

  subscribeMain(
    handler: (event: MainChannelEvent) => void,
  ): ChannelSubscription {
    return this.createSubscription(
      'stream_subscribe_main',
      {},
      (id) => {
        this.notifHandlers.set(id, handler)
        this.mainHandlers.set(id, handler)
      },
      (id) => {
        this.notifHandlers.delete(id)
        this.mainHandlers.delete(id)
      },
    )
  }

  subscribeMentions(
    handler: (note: NormalizedNote) => void,
    options?: { onNoteUpdated?: (event: NoteUpdateEvent) => void },
  ): ChannelSubscription {
    return this.createSubscription(
      'stream_subscribe_main',
      {},
      (id) => {
        this.mentionHandlers.set(id, handler)
        if (options?.onNoteUpdated)
          this.noteUpdateHandlers.set(id, options.onNoteUpdated)
      },
      (id) => {
        this.mentionHandlers.delete(id)
        this.noteUpdateHandlers.delete(id)
      },
    )
  }

  subscribeChatUser(
    otherId: string,
    handler: (msg: ChatMessage) => void,
    options?: { onDeleted?: (messageId: string) => void },
  ): ChannelSubscription {
    return this.createSubscription(
      'stream_subscribe_chat_user',
      { otherId },
      (id) => {
        this.chatMessageHandlers.set(id, handler)
        if (options?.onDeleted)
          this.chatDeletedHandlers.set(id, options.onDeleted)
      },
      (id) => {
        this.chatMessageHandlers.delete(id)
        this.chatDeletedHandlers.delete(id)
      },
    )
  }

  subscribeChatRoom(
    roomId: string,
    handler: (msg: ChatMessage) => void,
    options?: { onDeleted?: (messageId: string) => void },
  ): ChannelSubscription {
    return this.createSubscription(
      'stream_subscribe_chat_room',
      { roomId },
      (id) => {
        this.chatMessageHandlers.set(id, handler)
        if (options?.onDeleted)
          this.chatDeletedHandlers.set(id, options.onDeleted)
      },
      (id) => {
        this.chatMessageHandlers.delete(id)
        this.chatDeletedHandlers.delete(id)
      },
    )
  }

  subNote(noteId: string, handler: (event: NoteUpdateEvent) => void): void {
    this.noteCaptureHandlers.set(noteId, handler)
    invoke('stream_sub_note', {
      accountId: this.accountId,
      noteId,
    }).catch((e) => {
      console.warn('[stream] subNote failed:', e)
    })
  }

  unsubNote(noteId: string): void {
    this.noteCaptureHandlers.delete(noteId)
    invoke('stream_unsub_note', {
      accountId: this.accountId,
      noteId,
    }).catch((e) => {
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

  private emit(event: string): void {
    for (const handler of this.eventHandlers.get(event) ?? []) {
      handler()
    }
  }
}
