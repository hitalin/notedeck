import { invoke } from '@tauri-apps/api/core'
import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { ServerInfo } from '@/adapters/types'
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

  async function loadCachedServers(): Promise<void> {
    const stored = await invoke<StoredServer[]>('load_servers')
    const next = new Map(servers.value)
    for (const s of stored) {
      const parsed = JSON.parse(s.featuresJson)
      const { _iconUrl, ...features } = parsed
      const info: ServerInfo = {
        host: s.host,
        software: s.software as ServerInfo['software'],
        version: s.version,
        features,
      }
      if ('_iconUrl' in parsed) info.iconUrl = _iconUrl
      next.set(s.host, info)
    }
    servers.value = next
  }

  async function getServerInfo(host: string): Promise<ServerInfo> {
    const cached = servers.value.get(host)
    if (cached?.iconUrl) return cached

    const stored = await invoke<StoredServer | null>('get_server', { host })
    if (stored && Date.now() - stored.updatedAt < CACHE_TTL_MS) {
      const parsed = JSON.parse(stored.featuresJson)
      if (parsed._iconUrl) {
        const { _iconUrl, ...features } = parsed
        const info: ServerInfo = {
          host: stored.host,
          software: stored.software as ServerInfo['software'],
          version: stored.version,
          features,
          iconUrl: _iconUrl,
        }
        const next = new Map(servers.value)
        next.set(host, info)
        servers.value = next
        return info
      }
    }

    const info = await detectServer(host)
    const next = new Map(servers.value)
    next.set(host, info)
    servers.value = next
    await invoke('upsert_server', {
      server: {
        host: info.host,
        software: info.software,
        version: info.version,
        featuresJson: JSON.stringify({
          ...info.features,
          _iconUrl: info.iconUrl,
        }),
        updatedAt: Date.now(),
      },
    })
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
