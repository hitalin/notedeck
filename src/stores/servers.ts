import { defineStore } from 'pinia'
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
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
  const servers = ref<Map<string, ServerInfo>>(new Map())

  async function loadCachedServers(): Promise<void> {
    const stored = await invoke<StoredServer[]>('load_servers')
    for (const s of stored) {
      servers.value.set(s.host, {
        host: s.host,
        software: s.software as ServerInfo['software'],
        version: s.version,
        features: JSON.parse(s.featuresJson),
      })
    }
  }

  async function getServerInfo(host: string): Promise<ServerInfo> {
    const cached = servers.value.get(host)
    if (cached) return cached

    const stored = await invoke<StoredServer | null>('get_server', { host })
    if (stored && Date.now() - stored.updatedAt < CACHE_TTL_MS) {
      const info: ServerInfo = {
        host: stored.host,
        software: stored.software as ServerInfo['software'],
        version: stored.version,
        features: JSON.parse(stored.featuresJson),
      }
      servers.value.set(host, info)
      return info
    }

    const info = await detectServer(host)
    servers.value.set(host, info)
    await invoke('upsert_server', {
      server: {
        host: info.host,
        software: info.software,
        version: info.version,
        featuresJson: JSON.stringify(info.features),
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
