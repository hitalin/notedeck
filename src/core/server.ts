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
  const nodeinfo = await fetchNodeInfo(host)
  const software = detectSoftware(nodeinfo.software.name)

  return {
    host,
    software,
    version: nodeinfo.software.version,
    features: defaultFeatures(),
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

  const res = await fetch(nodeinfoUrl)
  return res.json()
}

function detectSoftware(name: string): ServerSoftware {
  const normalized = name.toLowerCase()
  if (normalized === 'misskey' || normalized.includes('misskey')) {
    return 'misskey'
  }
  return 'unknown'
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
  }
}
