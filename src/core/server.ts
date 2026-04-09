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
    features: detectFeatures(software, nodeinfo.software.version),
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
 * Parse a Misskey-style version string (e.g. "2025.10.0") into comparable parts.
 * Returns null for unparseable versions.
 */
const MISSKEY_VERSION_RE = /^(\d{4})\.(\d+)\.(\d+)/

function parseMisskeyVersion(
  version: string,
): { major: number; minor: number; patch: number } | null {
  const match = version.match(MISSKEY_VERSION_RE)
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

function isVersionAtLeast(
  version: string,
  minMajor: number,
  minMinor: number,
  minPatch: number,
): boolean {
  const v = parseMisskeyVersion(version)
  if (!v) return false
  if (v.major !== minMajor) return v.major > minMajor
  if (v.minor !== minMinor) return v.minor > minMinor
  return v.patch >= minPatch
}

function detectFeatures(
  software: ServerSoftware,
  version: string,
): ServerFeatures {
  const features = defaultFeatures()

  // Misskey 本家: バージョンベースの capability 検出
  if (software === 'misskey-dev/misskey') {
    features.scheduledNotes = isVersionAtLeast(version, 2025, 10, 0)
    features.groupedNotifications = isVersionAtLeast(version, 2024, 2, 0)
    features.notesShowPartialBulk = isVersionAtLeast(version, 2025, 5, 1)
  }

  // フォーク固有の capability はここに追加。
  // カスタム TL や modeFlags は customTimelines.ts のポリシー検出で動的に対応済み。
  // 静的に宣言が必要な capability のみここで設定する。
  // 手順: DEVELOPMENT.md の "Fork support" を参照。

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
