import { invoke } from '@tauri-apps/api/core'
import type {
  ServerFeatures,
  ServerInfo,
  ServerSoftware,
} from '@/adapters/types'

interface NodeInfoSoftware {
  name: string
  version: string
}

interface NodeInfo {
  software: NodeInfoSoftware
  metadata?: Record<string, unknown>
}

export async function detectServer(host: string): Promise<ServerInfo> {
  const [nodeinfo, iconUrl] = await Promise.all([
    fetchNodeInfo(host),
    fetchIconUrl(host),
  ])
  const software = detectSoftware(nodeinfo.software.name)

  return {
    host,
    software,
    version: nodeinfo.software.version,
    features: detectFeatures(software, nodeinfo.software.version),
    iconUrl,
  }
}

async function fetchNodeInfo(host: string): Promise<NodeInfo> {
  const data = await invoke<NodeInfo>('fetch_nodeinfo', { host })
  return data
}

async function fetchIconUrl(host: string): Promise<string> {
  try {
    const data = await invoke<Record<string, unknown>>('fetch_server_meta', {
      host,
    })
    const url = (data.iconUrl ?? data.faviconUrl) as string | undefined
    if (url) {
      return url.startsWith('http') ? url : `https://${host}${url}`
    }
  } catch {
    // fall through to favicon fallback
  }
  return `https://${host}/favicon.ico`
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
function parseMisskeyVersion(
  version: string,
): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d{4})\.(\d+)\.(\d+)/)
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
  }
}
