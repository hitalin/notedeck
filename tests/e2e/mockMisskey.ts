/**
 * モック Misskey サーバー (#702) — HTTP + WebSocket。
 *
 * notecli が実際に叩く最小面だけを決定論的に実装する:
 * - GET  /.well-known/nodeinfo → nodeinfo 2.1 への href
 * - GET  /nodeinfo/2.1         → software 名/バージョン (サーバー検出)
 * - POST /api/meta             → サーバーメタ
 * - POST /api/miauth/{id}/check → MiAuth 完了 (ダミートークン発行)
 * - POST /api/*                → 登録ハンドラ or 空配列 fallback
 * - WS   /streaming            → connect/disconnect/subNote を受理、
 *                                pushNote() でチャンネルへ note を配信
 *
 * 切断制御 (dropConnections / refuseConnections) は #506 系の
 * 再接続回帰テスト用。
 */
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type WebSocket, WebSocketServer } from 'ws'

export interface MockAccount {
  userId: string
  username: string
  token: string
}

interface Subscription {
  ws: WebSocket
  channel: string
  subId: string
}

export interface MockMisskey {
  /** `127.0.0.1:{port}` — アカウントの host として使う */
  host: string
  port: number
  account: MockAccount
  /** 現在の WS 接続数 */
  wsConnectionCount(): number
  /** 現在のチャンネル購読 (channel 名の配列) */
  subscribedChannels(): string[]
  /** 指定チャンネルの全購読へ note イベントを配信する */
  pushNote(channel: string, note: Record<string, unknown>): number
  /** 全 WS 接続を無通告で切断する (半開/切断シミュレーション) */
  dropConnections(): void
  /** true の間、新規 WS 接続を拒否する */
  refuseConnections(refuse: boolean): void
  /** 受けた HTTP リクエストのパス履歴 (デバッグ用) */
  requestLog: string[]
  close(): Promise<void>
}

let noteSeq = 0

/** notecli/frontend が要求する最小形の Misskey note を生成する。 */
export function makeNote(
  account: MockAccount,
  host: string,
  text: string,
): Record<string, unknown> {
  noteSeq += 1
  const id = `e2enote${String(noteSeq).padStart(8, '0')}`
  return {
    id,
    createdAt: new Date().toISOString(),
    userId: account.userId,
    user: {
      id: account.userId,
      username: account.username,
      name: account.username,
      host: null,
      avatarUrl: `http://${host}/avatar.png`,
      avatarBlurhash: null,
      avatarDecorations: [],
      isBot: false,
      isCat: false,
      emojis: {},
      onlineStatus: 'online',
      badgeRoles: [],
    },
    text,
    cw: null,
    visibility: 'public',
    localOnly: false,
    reactionAcceptance: null,
    renoteCount: 0,
    repliesCount: 0,
    reactionCount: 0,
    reactions: {},
    reactionEmojis: {},
    emojis: {},
    fileIds: [],
    files: [],
    replyId: null,
    renoteId: null,
  }
}

export async function startMockMisskey(): Promise<MockMisskey> {
  const account: MockAccount = {
    userId: 'e2euser00000001',
    username: 'e2e',
    token: 'mock-token-e2e',
  }

  const requestLog: string[] = []
  const subscriptions: Subscription[] = []
  const sockets = new Set<WebSocket>()
  let refusing = false
  let host = '' // listen 後に確定

  const jsonBody = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  const httpHandler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${host}`)
    requestLog.push(`${req.method} ${url.pathname}`)

    if (url.pathname === '/.well-known/nodeinfo') {
      return jsonBody(res, 200, {
        links: [
          {
            rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
            href: `http://${host}/nodeinfo/2.1`,
          },
        ],
      })
    }
    if (url.pathname === '/nodeinfo/2.1') {
      return jsonBody(res, 200, {
        version: '2.1',
        software: { name: 'misskey', version: '2025.6.0' },
        metadata: { nodeName: 'E2E Mock Misskey' },
      })
    }
    if (/^\/api\/miauth\/[^/]+\/check$/.test(url.pathname)) {
      return jsonBody(res, 200, {
        ok: true,
        token: account.token,
        user: {
          id: account.userId,
          username: account.username,
          name: account.username,
          avatarUrl: null,
        },
      })
    }
    if (url.pathname === '/api/meta') {
      return jsonBody(res, 200, {
        name: 'E2E Mock Misskey',
        version: '2025.6.0',
        shortName: 'mock',
        uri: `http://${host}`,
        description: 'mock server for NoteDeck E2E',
        maintainerName: null,
        maintainerEmail: null,
        iconUrl: null,
        bannerUrl: null,
        themeColor: null,
        features: {},
      })
    }
    if (url.pathname === '/api/i') {
      return jsonBody(res, 200, {
        id: account.userId,
        username: account.username,
        name: account.username,
        avatarUrl: null,
        mutedWords: [],
        hardMutedWords: [],
        mutedInstances: [],
        emojis: {},
      })
    }
    if (url.pathname.startsWith('/api/')) {
      // タイムライン取得等は空で返す (E2E は WS 配信で検証する)
      return jsonBody(res, 200, [])
    }
    jsonBody(res, 404, { error: 'not found' })
  }

  const server: Server = createServer(httpHandler)
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${host}`)
    if (url.pathname !== '/streaming' || refusing) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws)
      ws.on('close', () => {
        sockets.delete(ws)
        for (let i = subscriptions.length - 1; i >= 0; i--) {
          if (subscriptions[i].ws === ws) subscriptions.splice(i, 1)
        }
      })
      ws.on('message', (data) => {
        let msg: { type?: string; body?: Record<string, unknown> }
        try {
          msg = JSON.parse(String(data))
        } catch {
          return
        }
        if (msg.type === 'connect' && msg.body) {
          subscriptions.push({
            ws,
            channel: String(msg.body.channel ?? ''),
            subId: String(msg.body.id ?? ''),
          })
        } else if (msg.type === 'disconnect' && msg.body) {
          const subId = String(msg.body.id ?? '')
          for (let i = subscriptions.length - 1; i >= 0; i--) {
            if (subscriptions[i].ws === ws && subscriptions[i].subId === subId)
              subscriptions.splice(i, 1)
          }
        }
        // subNote / unsubNote は冪等に受理するだけでよい
      })
      // Misskey サーバーは client ping に pong を返す (ws ライブラリの
      // autoPong デフォルトに任せる — notecli の read-idle 前提と同じ)
    })
  })

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  host = `127.0.0.1:${port}`

  return {
    host,
    port,
    account,
    requestLog,
    wsConnectionCount: () => sockets.size,
    subscribedChannels: () => subscriptions.map((s) => s.channel),
    pushNote(channel, note) {
      const targets = subscriptions.filter((s) => s.channel === channel)
      for (const sub of targets) {
        sub.ws.send(
          JSON.stringify({
            type: 'channel',
            body: { id: sub.subId, type: 'note', body: note },
          }),
        )
      }
      return targets.length
    },
    dropConnections() {
      for (const ws of sockets) ws.terminate()
    },
    refuseConnections(refuse) {
      refusing = refuse
    },
    async close() {
      for (const ws of sockets) ws.terminate()
      await new Promise<void>((resolve) => wss.close(() => resolve()))
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      )
    },
  }
}
