import { invoke } from '@tauri-apps/api/core'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { ServerInfo, ServerSoftware } from '@/adapters/types'
import { detectServer } from '@/core/server'

interface StoredServer {
  host: string
  software: string
  version: string
  featuresJson: string
  updatedAt: number
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export const useServersStore = defineStore('servers', () => {
  // shallowRef + full Map replacement avoids deep reactivity on server info objects
  const servers = shallowRef(new Map<string, ServerInfo>())

  const KNOWN_SOFTWARE = new Set<string>([
    'misskey',
    'firefish',
    'sharkey',
    'iceshrimp',
    'unknown',
  ])

  function toServerSoftware(value: string): ServerSoftware {
    return KNOWN_SOFTWARE.has(value) ? (value as ServerSoftware) : 'unknown'
  }

  function parseStoredServer(stored: StoredServer): ServerInfo | null {
    const parsed = JSON.parse(stored.featuresJson)
    if (!parsed) return null
    const { _iconUrl, _themeColor, ...features } = parsed
    const info: ServerInfo = {
      host: stored.host,
      software: toServerSoftware(stored.software),
      version: stored.version,
      features,
    }
    if ('_iconUrl' in parsed) info.iconUrl = _iconUrl
    if ('_themeColor' in parsed) info.themeColor = _themeColor
    return info
  }

  function setServer(host: string, info: ServerInfo) {
    const next = new Map(servers.value)
    next.set(host, info)
    servers.value = next
  }

  async function persistServer(info: ServerInfo): Promise<void> {
    await invoke('upsert_server', {
      server: {
        host: info.host,
        software: info.software,
        version: info.version,
        featuresJson: JSON.stringify({
          ...info.features,
          _iconUrl: info.iconUrl,
          _themeColor: info.themeColor,
        }),
        updatedAt: Date.now(),
      },
    })
  }

  function revalidateInBackground(host: string) {
    detectServer(host)
      .then((fresh) => {
        setServer(host, fresh)
        persistServer(fresh)
      })
      .catch(() => {
        /* offline — keep stale cache */
      })
  }

  async function loadCachedServers(): Promise<void> {
    const stored = await invoke<StoredServer[]>('load_servers')
    const next = new Map(servers.value)
    for (const s of stored) {
      const info = parseStoredServer(s)
      if (info) next.set(s.host, info)
    }
    servers.value = next
  }

  async function getServerInfo(host: string): Promise<ServerInfo> {
    const cached = servers.value.get(host)
    if (cached) return cached

    // Return DB cache immediately if available (SWR: stale-while-revalidate)
    const stored = await invoke<StoredServer | null>('get_server', { host })
    if (stored) {
      const info = parseStoredServer(stored)
      if (info) {
        setServer(host, info)
        if (Date.now() - stored.updatedAt >= CACHE_TTL_MS) {
          revalidateInBackground(host)
        }
        return info
      }
    }

    // No DB cache (first login) — network required
    const info = await detectServer(host)
    setServer(host, info)
    await persistServer(info)
    return info
  }

  function getServer(host: string): ServerInfo | undefined {
    return servers.value.get(host)
  }

  return {
    servers,
    loadCachedServers,
    getServerInfo,
    getServer,
  }
})
