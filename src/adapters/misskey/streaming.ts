import type { Channels, IChannelConnection } from 'misskey-js'
import { Stream } from 'misskey-js'
import type { Note } from 'misskey-js/entities.js'
import type {
  ChannelSubscription,
  MainChannelEvent,
  NormalizedNote,
  StreamAdapter,
  StreamConnectionState,
  TimelineType,
} from '../types'
import { normalizeNote } from './normalize'

type TimelineChannel = {
  [K in keyof Channels]: Channels[K]['events'] extends {
    note: (payload: Note) => void
  }
    ? K
    : never
}[keyof Channels]

const TIMELINE_CHANNELS: Record<TimelineType, TimelineChannel> = {
  home: 'homeTimeline',
  local: 'localTimeline',
  social: 'hybridTimeline',
  global: 'globalTimeline',
}

export class MisskeyStream implements StreamAdapter {
  private stream: Stream
  private _state: StreamConnectionState = 'initializing'
  private handlers = new Map<string, Set<() => void>>()
  private accountId: string
  private serverHost: string

  constructor(host: string, token: string, accountId: string) {
    this.accountId = accountId
    this.serverHost = host
    this.stream = new Stream(`https://${host}`, { token })
  }

  get state(): StreamConnectionState {
    return this._state
  }

  connect(): void {
    this._state = this.stream.state as StreamConnectionState
    this.stream.on('_connected_', () => {
      this._state = 'connected'
      this.emit('connected')
    })
    this.stream.on('_disconnected_', () => {
      this._state = 'disconnected'
      this.emit('disconnected')
    })
  }

  disconnect(): void {
    this.stream.close()
    this._state = 'disconnected'
    this.emit('disconnected')
  }

  subscribeTimeline(
    type: TimelineType,
    handler: (note: NormalizedNote) => void,
  ): ChannelSubscription {
    const channel = TIMELINE_CHANNELS[type]
    const connection = this.stream.useChannel(channel) as IChannelConnection<
      Channels[typeof channel]
    >

    const onNote = (note: Note) => {
      handler(normalizeNote(note, this.accountId, this.serverHost))
    }

    connection.on('note', onNote as never)

    return {
      dispose: () => {
        connection.dispose()
      },
    }
  }

  subscribeMain(
    handler: (event: MainChannelEvent) => void,
  ): ChannelSubscription {
    const connection = this.stream.useChannel('main')

    const events = [
      'notification',
      'mention',
      'reply',
      'renote',
      'follow',
      'followed',
      'unfollow',
    ] as const

    for (const eventName of events) {
      connection.on(eventName, ((body: unknown) => {
        handler({ type: eventName, body })
      }) as never)
    }

    return {
      dispose: () => {
        connection.dispose()
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
