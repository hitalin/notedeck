import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface PluginConfigDef {
  type: 'string' | 'number' | 'boolean'
  label: string
  description?: string
  default: unknown
}

export interface PluginMeta {
  installId: string
  name: string
  version: string
  author?: string
  description?: string
  permissions?: string[]
  config?: Record<string, PluginConfigDef>
  configData: Record<string, unknown>
  src: string
  active: boolean
}

const STORAGE_KEY = 'nd-plugins'

function loadPluginsFromStorage(): PluginMeta[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PluginMeta[]) : []
  } catch {
    return []
  }
}

function savePlugins(plugins: PluginMeta[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plugins))
}

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<PluginMeta[]>([])
  let loaded = false

  function ensureLoaded() {
    if (loaded) return
    loaded = true
    plugins.value = loadPluginsFromStorage()
  }

  const activePlugins = computed(() => {
    ensureLoaded()
    return plugins.value.filter((p) => p.active)
  })

  function persist() {
    savePlugins(plugins.value)
  }

  function addPlugin(plugin: PluginMeta) {
    ensureLoaded()
    plugins.value.push(plugin)
    persist()
  }

  function removePlugin(installId: string) {
    ensureLoaded()
    // Clean up plugin localStorage entries
    const prefix = `nd-aiscript-plugin:${installId}:`
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        localStorage.removeItem(key)
      }
    }
    plugins.value = plugins.value.filter((p) => p.installId !== installId)
    persist()
  }

  function setActive(installId: string, active: boolean) {
    ensureLoaded()
    const plugin = plugins.value.find((p) => p.installId === installId)
    if (plugin) {
      plugin.active = active
      persist()
    }
  }

  function updateConfigData(installId: string, data: Record<string, unknown>) {
    ensureLoaded()
    const plugin = plugins.value.find((p) => p.installId === installId)
    if (plugin) {
      plugin.configData = data
      persist()
    }
  }

  function getPlugin(installId: string): PluginMeta | undefined {
    ensureLoaded()
    return plugins.value.find((p) => p.installId === installId)
  }

  function isDuplicate(name: string): boolean {
    ensureLoaded()
    return plugins.value.some((p) => p.name === name)
  }

  return {
    plugins,
    activePlugins,
    ensureLoaded,
    addPlugin,
    removePlugin,
    setActive,
    updateConfigData,
    getPlugin,
    isDuplicate,
  }
})
