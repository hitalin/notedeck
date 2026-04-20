import { resolveSoftware } from '@/adapters/registry'
import type {
  ServerFeatures,
  ServerInfo,
  ServerSoftware,
} from '@/adapters/types'
import { commands, unwrap } from '@/utils/tauriInvoke'

interface NodeInfoSoftware {
  name: string
  version: string
  /** nodeinfo 2.1 で追加。例: "https://github.com/misskey-dev/misskey" */
  repository?: string
}

interface NodeInfo {
  software: NodeInfoSoftware
  metadata?: Record<string, unknown>
}

export async function detectServer(host: string): Promise<ServerInfo> {
  const [nodeinfo, serverMeta] = await Promise.all([
    fetchNodeInfo(host),
    fetchServerMeta(host),
  ])
  const software = detectSoftware(
    nodeinfo.software.name,
    nodeinfo.software.repository,
  )

  return {
    host,
    software,
    version: nodeinfo.software.version,
    features: detectFeatures(software),
    iconUrl: serverMeta.iconUrl,
    themeColor: serverMeta.themeColor,
    infoImageUrl: serverMeta.infoImageUrl,
    notFoundImageUrl: serverMeta.notFoundImageUrl,
    serverErrorImageUrl: serverMeta.serverErrorImageUrl,
  }
}

async function fetchNodeInfo(host: string): Promise<NodeInfo> {
  return unwrap(await commands.fetchNodeinfo(host)) as unknown as NodeInfo
}

interface ServerMetaResult {
  iconUrl: string
  themeColor: string | null
  infoImageUrl?: string
  notFoundImageUrl?: string
  serverErrorImageUrl?: string
}

function resolveUrl(host: string, raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  return raw.startsWith('http') ? raw : `https://${host}${raw}`
}

async function fetchServerMeta(host: string): Promise<ServerMetaResult> {
  try {
    const data = unwrap(await commands.fetchServerMeta(host)) as Record<
      string,
      unknown
    >
    const url = (data.iconUrl ?? data.faviconUrl) as string | undefined
    const iconUrl = url
      ? url.startsWith('http')
        ? url
        : `https://${host}${url}`
      : `https://${host}/favicon.ico`
    const themeColor =
      typeof data.themeColor === 'string' ? data.themeColor : null
    return {
      iconUrl,
      themeColor,
      infoImageUrl: resolveUrl(host, data.infoImageUrl),
      notFoundImageUrl: resolveUrl(host, data.notFoundImageUrl),
      serverErrorImageUrl: resolveUrl(host, data.serverErrorImageUrl),
    }
  } catch {
    return { iconUrl: `https://${host}/favicon.ico`, themeColor: null }
  }
}

function detectSoftware(name: string, repositoryUrl?: string): ServerSoftware {
  return resolveSoftware(name, repositoryUrl)
}

/**
 * NoteDeck の前提は「最新版 Misskey または最新版を追従しているフォーク」。
 * 古いバージョンを名乗るサーバーはサポート対象外のため、版数ガードを設けず
 * Misskey 互換と判定したすべてで capability を有効化する。未対応サーバーでは
 * 実際の API 呼び出しがエラーで返るので fail-fast する。
 *
 * フォーク固有の capability はここに追加。カスタム TL や modeFlags は
 * customTimelines.ts のポリシー検出で動的に対応済み。静的に宣言が必要な
 * capability のみここで設定する。手順: DEVELOPMENT.md の "Fork support" を参照。
 */
function detectFeatures(software: ServerSoftware): ServerFeatures {
  const features = defaultFeatures()

  if (software !== 'unknown') {
    features.scheduledNotes = true
    features.groupedNotifications = true
    features.notesShowPartialBulk = true
  }

  return features
}

function defaultFeatures(): ServerFeatures {
  return {
    mastodonApi: false,
    reactions: true,
    customEmoji: true,
    drive: true,
    channels: true,
    antennas: true,
    quotes: true,
    scheduledNotes: false,
    groupedNotifications: false,
  }
}
