import JSON5 from 'json5'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import * as settingsFs from '@/utils/settingsFs'
import {
  getStorageJson,
  removeStorageByPrefix,
  STORAGE_KEYS,
  setStorageJson,
} from '@/utils/storage'

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

/** Metadata fields stored in *.meta.json5 (everything except src). */
interface PluginFileMeta {
  installId: string
  name: string
  version: string
  author?: string
  description?: string
  permissions?: string[]
  config?: Record<string, PluginConfigDef>
  configData: Record<string, unknown>
  active: boolean
}

function loadPluginsFromStorage(): PluginMeta[] {
  return getStorageJson<PluginMeta[]>(STORAGE_KEYS.plugins, [])
}

function savePluginsToStorage(plugins: PluginMeta[]) {
  setStorageJson(STORAGE_KEYS.plugins, plugins)
}

export const usePluginsStore = defineStore('plugins', () => {
  const plugins = ref<PluginMeta[]>([])
  let loaded = false
  const initialized = ref(false)

  function ensureLoaded() {
    if (loaded) return
    loaded = true
    plugins.value = loadPluginsFromStorage()

    // Kick off file-based init (Tauri only)
    if (settingsFs.isTauri) {
      initFileStorage().catch((e) =>
        console.warn('[plugins] file storage init failed:', e),
      )
    } else {
      initialized.value = true
    }
  }

  const activePlugins = computed(() => {
    ensureLoaded()
    return plugins.value.filter((p) => p.active)
  })

  function persist() {
    savePluginsToStorage(plugins.value)
    if (initialized.value) {
      persistAllToFiles().catch((e) =>
        console.warn('[plugins] failed to persist to files:', e),
      )
    }
  }

  /** Write a single plugin to its .is and .meta.json5 files. */
  async function persistSinglePlugin(plugin: PluginMeta): Promise<void> {
    const baseName = plugin.name || plugin.installId
    const srcFilename = settingsFs.pluginSrcFilename(baseName)
    const metaFilename = settingsFs.pluginMetaFilename(baseName)

    await settingsFs.writePluginFile(srcFilename, plugin.src)

    const meta: PluginFileMeta = {
      installId: plugin.installId,
      name: plugin.name,
      version: plugin.version,
      ...(plugin.author ? { author: plugin.author } : {}),
      ...(plugin.description ? { description: plugin.description } : {}),
      ...(plugin.permissions?.length
        ? { permissions: plugin.permissions }
        : {}),
      ...(plugin.config ? { config: plugin.config } : {}),
      configData: plugin.configData,
      active: plugin.active,
    }
    await settingsFs.writePluginFile(
      metaFilename,
      JSON5.stringify(meta, null, 2),
    )
  }

  /** Write all plugins to files. */
  async function persistAllToFiles(): Promise<void> {
    for (const plugin of plugins.value) {
      await persistSinglePlugin(plugin)
    }
  }

  /** Delete a plugin's files. */
  async function deletePluginFiles(plugin: PluginMeta): Promise<void> {
    const baseName = plugin.name || plugin.installId
    await settingsFs.deletePluginFile(settingsFs.pluginSrcFilename(baseName))
    await settingsFs.deletePluginFile(settingsFs.pluginMetaFilename(baseName))
  }

  /** Load plugins from files. Files are source of truth. */
  async function initFileStorage(): Promise<void> {
    const allFiles = await settingsFs.listPluginFiles()
    const metaFiles = allFiles.filter((f) => f.endsWith('.meta.json5'))

    if (metaFiles.length > 0) {
      const filePlugins: PluginMeta[] = []
      for (const metaFile of metaFiles) {
        try {
          const metaContent = await settingsFs.readPluginFile(metaFile)
          const meta = JSON5.parse(metaContent) as PluginFileMeta

          // Derive .is filename from .meta.json5 filename
          const srcFile = metaFile.replace(/\.meta\.json5$/, '.is')
          let src = ''
          if (allFiles.includes(srcFile)) {
            src = await settingsFs.readPluginFile(srcFile)
          }

          filePlugins.push({
            installId: meta.installId || metaFile,
            name: meta.name || metaFile,
            version: meta.version || '0.0.0',
            author: meta.author,
            description: meta.description,
            permissions: meta.permissions,
            config: meta.config,
            configData: meta.configData || {},
            src,
            active: meta.active ?? false,
          })
        } catch (e) {
          console.warn(`[plugins] failed to parse ${metaFile}:`, e)
        }
      }

      if (filePlugins.length > 0) {
        plugins.value = filePlugins
        savePluginsToStorage(filePlugins)
      }
    }

    initialized.value = true

    // Migrate: localStorage has plugins but no files exist
    if (metaFiles.length === 0 && plugins.value.length > 0) {
      persistAllToFiles().catch((e) =>
        console.warn('[plugins] migration to files failed:', e),
      )
    }
  }

  function addPlugin(plugin: PluginMeta) {
    ensureLoaded()
    plugins.value.push(plugin)
    persist()
  }

  function removePlugin(installId: string) {
    ensureLoaded()
    const removed = plugins.value.find((p) => p.installId === installId)
    // Clean up plugin localStorage entries
    removeStorageByPrefix(STORAGE_KEYS.aiscriptPlugin(installId))
    plugins.value = plugins.value.filter((p) => p.installId !== installId)
    persist()
    // Delete files
    if (initialized.value && removed) {
      deletePluginFiles(removed).catch((e) =>
        console.warn('[plugins] failed to delete plugin files:', e),
      )
    }
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

  function updateSrc(installId: string, src: string) {
    ensureLoaded()
    const plugin = plugins.value.find((p) => p.installId === installId)
    if (plugin) {
      plugin.src = src
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
    updateSrc,
    getPlugin,
    isDuplicate,
  }
})
