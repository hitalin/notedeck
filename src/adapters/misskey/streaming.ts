import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  ChannelSubscription,
  MainChannelEvent,
  NormalizedNote,
  NormalizedNotification,
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

interface StreamMainEvent {
  accountId: string
  subscriptionId: string
  eventType: string
  body: unknown
}

interface StreamStatusEvent {
  accountId: string
  state: StreamConnectionState
}

export class MisskeyStream implements StreamAdapter {
  private accountId: string
  private _state: StreamConnectionState = 'initializing'
  private handlers = new Map<string, Set<() => void>>()
  private statusUnlisten: (() => void) | null = null

  constructor(accountId: string) {
    this.accountId = accountId
  }

  get state(): StreamConnectionState {
    return this._state
  }

  connect(): void {
    // Listen for connection status events
    listen<StreamStatusEvent>('stream-status', (event) => {
      if (event.payload.accountId !== this.accountId) return
      this._state = event.payload.state
      this.emit(event.payload.state)
    }).then((unlisten) => {
      this.statusUnlisten = unlisten
    })

    invoke('stream_connect', { accountId: this.accountId }).then(() => {
      this._state = 'connected'
      this.emit('connected')
    }).catch((e) => {
      console.error('[stream] connect failed:', e)
      this._state = 'disconnected'
      this.emit('disconnected')
    })
  }

  disconnect(): void {
    this.statusUnlisten?.()
    this.statusUnlisten = null
    invoke('stream_disconnect', { accountId: this.accountId }).catch(() => {})
    this._state = 'disconnected'
    this.emit('disconnected')
  }

  subscribeTimeline(
    type: TimelineType,
    handler: (note: NormalizedNote) => void,
  ): ChannelSubscription {
    let noteUnlisten: (() => void) | null = null
    let subscriptionId: string | null = null

    // Listen for note events first, then subscribe
    listen<StreamNoteEvent>('stream-note', (event) => {
      if (event.payload.accountId !== this.accountId) return
      if (subscriptionId && event.payload.subscriptionId !== subscriptionId) return
      handler(event.payload.note)
    }).then((unlisten) => {
      noteUnlisten = unlisten
    })

    invoke<string>('stream_subscribe_timeline', {
      accountId: this.accountId,
      timelineType: type,
    }).then((id) => {
      subscriptionId = id
    }).catch((e) => {
      console.error('[stream] subscribe timeline failed:', e)
    })

    return {
      dispose: () => {
        noteUnlisten?.()
        if (subscriptionId) {
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId,
          }).catch(() => {})
        }
      },
    }
  }

  subscribeMain(
    handler: (event: MainChannelEvent) => void,
  ): ChannelSubscription {
    let notifUnlisten: (() => void) | null = null
    let mainUnlisten: (() => void) | null = null
    let subscriptionId: string | null = null

    // Listen for notification events
    listen<StreamNotificationEvent>('stream-notification', (event) => {
      if (event.payload.accountId !== this.accountId) return
      if (subscriptionId && event.payload.subscriptionId !== subscriptionId) return
      handler({
        type: 'notification',
        body: event.payload.notification,
      })
    }).then((unlisten) => {
      notifUnlisten = unlisten
    })

    // Listen for other main channel events
    listen<StreamMainEvent>('stream-main-event', (event) => {
      if (event.payload.accountId !== this.accountId) return
      if (subscriptionId && event.payload.subscriptionId !== subscriptionId) return
      handler({
        type: event.payload.eventType,
        body: event.payload.body,
      })
    }).then((unlisten) => {
      mainUnlisten = unlisten
    })

    invoke<string>('stream_subscribe_main', {
      accountId: this.accountId,
    }).then((id) => {
      subscriptionId = id
    }).catch((e) => {
      console.error('[stream] subscribe main failed:', e)
    })

    return {
      dispose: () => {
        notifUnlisten?.()
        mainUnlisten?.()
        if (subscriptionId) {
          invoke('stream_unsubscribe', {
            accountId: this.accountId,
            subscriptionId,
          }).catch(() => {})
        }
      },
    }
  }

  on(
    event: 'connected' | 'disconnected' | 'reconnecting',
    handler: () => void,
  ): void {
    const set = this.handlers.get(event) ?? new Set()
    set.add(handler)
    this.handlers.set(event, set)
  }

  off(event: string, handler: () => void): void {
    this.handlers.get(event)?.delete(handler)
  }

  private emit(event: string): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler()
    }
  }
}
