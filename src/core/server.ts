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

interface WellKnownNodeInfo {
  links: Array<{
    rel: string
    href: string
  }>
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
  const wellKnownRes = await fetch(`https://${host}/.well-known/nodeinfo`)
  const wellKnown: WellKnownNodeInfo = await wellKnownRes.json()

  const nodeinfoUrl = wellKnown.links.find((link) =>
    link.rel.includes('nodeinfo'),
  )?.href
  if (!nodeinfoUrl) {
    throw new Error(`No nodeinfo URL found for ${host}`)
  }

  // Validate the URL to prevent SSRF via malicious .well-known response
  try {
    const u = new URL(nodeinfoUrl)
    if (u.protocol !== 'https:') {
      throw new Error(`Unsafe nodeinfo protocol: ${u.protocol}`)
    }
    if (u.hostname !== host) {
      throw new Error(`Nodeinfo URL host mismatch: ${u.hostname} !== ${host}`)
    }
  } catch (e) {
    throw new Error(`Invalid nodeinfo URL for ${host}: ${e}`)
  }

  const res = await fetch(nodeinfoUrl)
  return res.json()
}

async function fetchIconUrl(host: string): Promise<string> {
  try {
    const res = await fetch(`https://${host}/api/meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const data = await res.json()
    const url = data.iconUrl ?? data.faviconUrl
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
