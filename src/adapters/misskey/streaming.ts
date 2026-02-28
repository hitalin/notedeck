import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  ChannelSubscription,
  MainChannelEvent,
  NormalizedNote,
  NormalizedNotification,
  NoteUpdateEvent,
  StreamAdapter,
  StreamConnectionState,
  TimelineType,
} from '../types'

interface StreamNoteEvent {
  accountId: string
  subscriptionId: string
  note: NormalizedNote
}

interface StreamNotificationEvent {
  accountId: string
  subscriptionId: string
  notification: NormalizedNotification
}

interface StreamMentionEvent {
  accountId: string
  subscriptionId: string
  note: NormalizedNote
}

interface StreamMainEvent {
  accountId: string
  subscriptionId: string
  eventType: string
  body: unknown
}

interface StreamNoteUpdatedEvent {
  accountId: string
  subscriptionId: string
  noteId: string
  updateType: string
  body: unknown
}

interface StreamStatusEvent {
  accountId: string
  state: StreamConnectionState
}

export class MisskeyStream implements StreamAdapter {
  private accountId: string
  private _state: StreamConnectionState = 'initializing'
  private eventHandlers = new Map<string, Set<() => void>>()

  // Centralized listeners (registered once in connect(), cleaned up in disconnect())
  private unlistenFns: (() => void)[] = []

  // Handler maps for O(1) dispatch by subscriptionId
  private noteHandlers = new Map<string, (note: NormalizedNote) => void>()
  private noteUpdateHandlers = new Map<
    string,
    (event: NoteUpdateEvent) => void
  >()
  private notifHandlers = new Map<string, (event: MainChannelEvent) => void>()
  private mainHandlers = new Map<string, (event: MainChannelEvent) => void>()
  private mentionHandlers = new Map<string, (note: NormalizedNote) => void>()

  constructor(accountId: string) {
    this.accountId = accountId
  }

  get state(): StreamConnectionState {
    return this._state
  }

  connect(): void {
    // Register centralized listeners (one per event type)
    listen<StreamStatusEvent>('stream-status', (event) => {
      if (event.payload.accountId !== this.accountId) return
      this._state = event.payload.state
      this.emit(event.payload.state)
    })
      .then((fn) => this.unlistenFns.push(fn))
      .catch((e) =>
        console.error('[stream] failed to listen stream-status:', e),
      )

    listen<StreamNoteEvent>('stream-note', (event) => {
      if (event.payload.accountId !== this.accountId) return
      this.noteHandlers.get(event.payload.subscriptionId)?.(event.payload.note)
    })
      .then((fn) => this.unlistenFns.push(fn))
      .catch((e) => console.error('[stream] failed to listen stream-note:', e))

    listen<StreamNoteUpdatedEvent>('stream-note-updated', (event) => {
      if (event.payload.accountId !== this.accountId) return
      this.noteUpdateHandlers.get(event.payload.subscriptionId)?.({
        noteId: event.payload.noteId,
        type: event.payload.updateType as NoteUpdateEvent['type'],
        body: event.payload.body as NoteUpdateEvent['body'],
      })
    })
      .then((fn) => this.unlistenFns.push(fn))
      .catch((e) =>
        console.error('[stream] failed to listen stream-note-updated:', e),
      )

    listen<StreamNotificationEvent>('stream-notification', (event) => {
      if (event.payload.accountId !== this.accountId) return
      this.notifHandlers.get(event.payload.subscriptionId)?.({
        type: 'notification',
        body: event.payload.notification,
      })
    })
      .then((fn) => this.unlistenFns.push(fn))
      .catch((e) =>
        console.error('[stream] failed to listen stream-notification:', e),
      )

    listen<StreamMentionEvent>('stream-mention', (event) => {
      if (event.payload.accountId !== this.accountId) return
      this.mentionHandlers.get(event.payload.subscriptionId)?.(
        event.payload.note,
      )
    })
      .then((fn) => this.unlistenFns.push(fn))
      .catch((e) =>
        console.error('[stream] failed to listen stream-mention:', e),
      )

    listen<StreamMainEvent>('stream-main-event', (event) => {
      if (event.payload.accountId !== this.accountId) return
      this.mainHandlers.get(event.payload.subscriptionId)?.({
        type: event.payload.eventType,
        body: event.payload.body,
      })
    })
      .then((fn) => this.unlistenFns.push(fn))
      .catch((e) =>
        console.error('[stream] failed to listen stream-main-event:', e),
      )

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

  cleanup(): void {
    for (const fn of this.unlistenFns) fn()
    this.unlistenFns = []
    this.noteHandlers.clear()
    this.noteUpdateHandlers.clear()
    this.notifHandlers.clear()
    this.mainHandlers.clear()
    this._state = 'disconnected'
  }

  disconnect(): void {
    this.cleanup()
    invoke('stream_disconnect', { accountId: this.accountId }).catch((e) => {
      console.warn('[stream] disconnect failed:', e)
    })
    this.emit('disconnected')
  }

  subscribeTimeline(
    type: TimelineType,
    handler: (note: NormalizedNote) => void,
    options?: { onNoteUpdated?: (event: NoteUpdateEvent) => void; listId?: string },
  ): ChannelSubscription {
    let subscriptionId: string | null = null
    let disposed = false

    const subscribePromise = invoke<string>('stream_subscribe_timeline', {
      accountId: this.accountId,
      timelineType: type,
      listId: options?.listId ?? null,
    })
      .then((id) => {
        if (disposed) {
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId: id,
          }).catch(() => {})
          return null
        }
        subscriptionId = id
        this.noteHandlers.set(id, handler)
        if (options?.onNoteUpdated) {
          this.noteUpdateHandlers.set(id, options.onNoteUpdated)
        }
        return id
      })
      .catch((e) => {
        console.error('[stream] subscribe timeline failed:', e)
        return null
      })

    return {
      dispose: () => {
        disposed = true
        if (subscriptionId) {
          this.noteHandlers.delete(subscriptionId)
          this.noteUpdateHandlers.delete(subscriptionId)
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId,
          }).catch((e) => {
            console.warn('[stream] unsubscribe failed:', e)
          })
        } else {
          subscribePromise.then((id) => {
            if (id) {
              this.noteHandlers.delete(id)
              this.noteUpdateHandlers.delete(id)
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

  subscribeAntenna(
    antennaId: string,
    handler: (note: NormalizedNote) => void,
    options?: { onNoteUpdated?: (event: NoteUpdateEvent) => void },
  ): ChannelSubscription {
    let subscriptionId: string | null = null
    let disposed = false

    const subscribePromise = invoke<string>('stream_subscribe_antenna', {
      accountId: this.accountId,
      antennaId,
    })
      .then((id) => {
        if (disposed) {
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId: id,
          }).catch(() => {})
          return null
        }
        subscriptionId = id
        this.noteHandlers.set(id, handler)
        if (options?.onNoteUpdated) {
          this.noteUpdateHandlers.set(id, options.onNoteUpdated)
        }
        return id
      })
      .catch((e) => {
        console.error('[stream] subscribe antenna failed:', e)
        return null
      })

    return {
      dispose: () => {
        disposed = true
        if (subscriptionId) {
          this.noteHandlers.delete(subscriptionId)
          this.noteUpdateHandlers.delete(subscriptionId)
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId,
          }).catch((e) => {
            console.warn('[stream] unsubscribe failed:', e)
          })
        } else {
          subscribePromise.then((id) => {
            if (id) {
              this.noteHandlers.delete(id)
              this.noteUpdateHandlers.delete(id)
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

  subscribeChannel(
    channelId: string,
    handler: (note: NormalizedNote) => void,
    options?: { onNoteUpdated?: (event: NoteUpdateEvent) => void },
  ): ChannelSubscription {
    let subscriptionId: string | null = null
    let disposed = false

    const subscribePromise = invoke<string>('stream_subscribe_channel', {
      accountId: this.accountId,
      channelId,
    })
      .then((id) => {
        if (disposed) {
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId: id,
          }).catch(() => {})
          return null
        }
        subscriptionId = id
        this.noteHandlers.set(id, handler)
        if (options?.onNoteUpdated) {
          this.noteUpdateHandlers.set(id, options.onNoteUpdated)
        }
        return id
      })
      .catch((e) => {
        console.error('[stream] subscribe channel failed:', e)
        return null
      })

    return {
      dispose: () => {
        disposed = true
        if (subscriptionId) {
          this.noteHandlers.delete(subscriptionId)
          this.noteUpdateHandlers.delete(subscriptionId)
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId,
          }).catch((e) => {
            console.warn('[stream] unsubscribe failed:', e)
          })
        } else {
          subscribePromise.then((id) => {
            if (id) {
              this.noteHandlers.delete(id)
              this.noteUpdateHandlers.delete(id)
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

  subscribeMain(
    handler: (event: MainChannelEvent) => void,
  ): ChannelSubscription {
    let subscriptionId: string | null = null
    let disposed = false

    const subscribePromise = invoke<string>('stream_subscribe_main', {
      accountId: this.accountId,
    })
      .then((id) => {
        if (disposed) {
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId: id,
          }).catch(() => {})
          return null
        }
        subscriptionId = id
        this.notifHandlers.set(id, handler)
        this.mainHandlers.set(id, handler)
        return id
      })
      .catch((e) => {
        console.error('[stream] subscribe main failed:', e)
        return null
      })

    return {
      dispose: () => {
        disposed = true
        if (subscriptionId) {
          this.notifHandlers.delete(subscriptionId)
          this.mainHandlers.delete(subscriptionId)
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId,
          }).catch((e) => {
            console.warn('[stream] unsubscribe failed:', e)
          })
        } else {
          subscribePromise.then((id) => {
            if (id) {
              this.notifHandlers.delete(id)
              this.mainHandlers.delete(id)
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

  subscribeMentions(
    handler: (note: NormalizedNote) => void,
  ): ChannelSubscription {
    let subscriptionId: string | null = null
    let disposed = false

    const subscribePromise = invoke<string>('stream_subscribe_main', {
      accountId: this.accountId,
    })
      .then((id) => {
        if (disposed) {
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId: id,
          }).catch(() => {})
          return null
        }
        subscriptionId = id
        this.mentionHandlers.set(id, handler)
        return id
      })
      .catch((e) => {
        console.error('[stream] subscribe mentions failed:', e)
        return null
      })

    return {
      dispose: () => {
        disposed = true
        if (subscriptionId) {
          this.mentionHandlers.delete(subscriptionId)
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId,
          }).catch((e) => {
            console.warn('[stream] unsubscribe failed:', e)
          })
        } else {
          subscribePromise.then((id) => {
            if (id) {
              this.mentionHandlers.delete(id)
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
