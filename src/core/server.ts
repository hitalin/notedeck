import type {
  ServerFeatures,
  ServerInfo,
  ServerSoftware,
} from '@/adapters/types'
import { invoke } from '@/utils/tauriInvoke'

interface NodeInfoSoftware {
  name: string
  version: string
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
  const software = detectSoftware(nodeinfo.software.name)

  return {
    host,
    software,
    version: nodeinfo.software.version,
    features: detectFeatures(software, nodeinfo.software.version),
    iconUrl: serverMeta.iconUrl,
    themeColor: serverMeta.themeColor,
  }
}

async function fetchNodeInfo(host: string): Promise<NodeInfo> {
  const data = await invoke<NodeInfo>('fetch_nodeinfo', { host })
  return data
}

async function fetchServerMeta(
  host: string,
): Promise<{ iconUrl: string; themeColor: string | null }> {
  try {
    const data = await invoke<Record<string, unknown>>('fetch_server_meta', {
      host,
    })
    const url = (data.iconUrl ?? data.faviconUrl) as string | undefined
    const iconUrl = url
      ? url.startsWith('http')
        ? url
        : `https://${host}${url}`
      : `https://${host}/favicon.ico`
    const themeColor =
      typeof data.themeColor === 'string' ? data.themeColor : null
    return { iconUrl, themeColor }
  } catch {
    return { iconUrl: `https://${host}/favicon.ico`, themeColor: null }
  }
}

function detectSoftware(name: string): ServerSoftware {
  const n = name.toLowerCase()
  if (n === 'firefish' || n === 'calckey') return 'firefish'
  if (n === 'sharkey') return 'sharkey'
  if (n === 'iceshrimp' || n === 'iceshrimp.net') return 'iceshrimp'
  if (n === 'misskey' || n.includes('misskey')) return 'misskey'
  return 'unknown'
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

  if (software === 'misskey') {
    features.scheduledNotes = isVersionAtLeast(version, 2025, 10, 0)
    features.groupedNotifications = isVersionAtLeast(version, 2024, 2, 0)
    features.notesShowPartialBulk = isVersionAtLeast(version, 2025, 5, 1)
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
