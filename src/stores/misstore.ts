import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { launchPlugin, parsePluginMeta } from '@/aiscript/plugin-api'
import { type PluginMeta, usePluginsStore } from '@/stores/plugins'
import { useThemeStore } from '@/stores/theme'

const STORE_BASE_URL = 'https://misstore.hital.in'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export function getPluginDetailUrl(id: string): string {
  return `${STORE_BASE_URL}/plugins/${encodeURIComponent(id)}`
}

export function getWidgetDetailUrl(id: string): string {
  return `${STORE_BASE_URL}/widgets/${encodeURIComponent(id)}`
}

// --- MisStore types (mirrors misstore registry schema) ---

export type PluginCategory =
  | 'posting'
  | 'timeline'
  | 'moderation'
  | 'utility'
  | 'integration'
  | 'appearance'
  | 'other'

export const PLUGIN_CATEGORY_LABELS: Record<PluginCategory, string> = {
  posting: 'Posting',
  timeline: 'Timeline',
  moderation: 'Moderation',
  utility: 'Utility',
  integration: 'Integration',
  appearance: 'Appearance',
  other: 'Other',
}

export interface StorePluginEntry {
  id: string
  name: string
  version: string
  author: string
  description: string
  category: PluginCategory
  tags: string[]
  sourceUrl: string
  apiUrl: string
  sha512: string
  createdAt: string
  updatedAt: string
}

export interface StoreThemeEntry {
  id: string
  name: string
  version: string
  author: string
  description: string
  base: 'dark' | 'light'
  tags: string[]
  sourceUrl: string
  apiUrl: string
  sha512: string
  createdAt: string
  updatedAt: string
  previewColors: {
    bg: string
    fg: string
    panel: string
    accent: string
  }
}

export interface StoreWidgetEntry {
  id: string
  name: string
  version: string
  author: string
  description: string
  icon: string
  autoRun: boolean
  /** Widget が要求する能力。例: 'misskey-api', 'misskey-account'。
   *  NoteDeck 側の互換性判定に使われる (checkWidgetCapabilities 参照)。 */
  capabilities: string[]
  tags: string[]
  sourceUrl: string
  apiUrl: string
  sha512: string
  createdAt: string
  updatedAt: string
}

// --- SHA-512 verification ---

async function computeSha512(source: string): Promise<string> {
  const normalized = source.replace(/\r\n/g, '\n')
  const encoded = new TextEncoder().encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-512', encoded)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// --- Store ---

export const useMisStoreStore = defineStore('misstore', () => {
  const plugins = shallowRef<StorePluginEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const installing = ref<string | null>(null) // installId of currently installing
  let lastFetchedAt = 0

  const themes = shallowRef<StoreThemeEntry[]>([])
  const themesLoading = ref(false)
  const themesError = ref<string | null>(null)
  const installingTheme = ref<string | null>(null)
  let themesLastFetchedAt = 0

  const widgets = shallowRef<StoreWidgetEntry[]>([])
  const widgetsLoading = ref(false)
  const widgetsError = ref<string | null>(null)
  let widgetsLastFetchedAt = 0

  const isCacheValid = () => Date.now() - lastFetchedAt < CACHE_TTL_MS
  const isThemesCacheValid = () =>
    Date.now() - themesLastFetchedAt < CACHE_TTL_MS
  const isWidgetsCacheValid = () =>
    Date.now() - widgetsLastFetchedAt < CACHE_TTL_MS

  async function fetchPlugins(): Promise<void> {
    if (isCacheValid() && plugins.value.length > 0) return
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${STORE_BASE_URL}/registry/plugins.json`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      plugins.value = data.plugins ?? []
      lastFetchedAt = Date.now()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'fetch failed'
    } finally {
      loading.value = false
    }
  }

  async function fetchThemes(): Promise<void> {
    if (isThemesCacheValid() && themes.value.length > 0) return
    themesLoading.value = true
    themesError.value = null
    try {
      const res = await fetch(`${STORE_BASE_URL}/registry/themes.json`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      themes.value = data.themes ?? []
      themesLastFetchedAt = Date.now()
    } catch (e) {
      themesError.value = e instanceof Error ? e.message : 'fetch failed'
    } finally {
      themesLoading.value = false
    }
  }

  async function fetchWidgets(): Promise<void> {
    if (isWidgetsCacheValid() && widgets.value.length > 0) return
    widgetsLoading.value = true
    widgetsError.value = null
    try {
      const res = await fetch(`${STORE_BASE_URL}/registry/widgets.json`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      widgets.value = data.widgets ?? []
      widgetsLastFetchedAt = Date.now()
    } catch (e) {
      widgetsError.value = e instanceof Error ? e.message : 'fetch failed'
    } finally {
      widgetsLoading.value = false
    }
  }

  async function fetchWidgetSource(entry: StoreWidgetEntry): Promise<string> {
    const res = await fetch(entry.sourceUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const source = await res.text()

    const hash = await computeSha512(source)
    if (hash !== entry.sha512) {
      throw new Error(
        'ハッシュ不一致: ソースが改ざんされている可能性があります',
      )
    }
    return source
  }

  function refresh(): Promise<void> {
    lastFetchedAt = 0
    return fetchPlugins()
  }

  function refreshThemes(): Promise<void> {
    themesLastFetchedAt = 0
    return fetchThemes()
  }

  function refreshWidgets(): Promise<void> {
    widgetsLastFetchedAt = 0
    return fetchWidgets()
  }

  // --- Install ---

  async function installPlugin(entry: StorePluginEntry): Promise<void> {
    installing.value = entry.id
    try {
      const res = await fetch(entry.sourceUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const source = await res.text()

      // SHA-512 verification
      const hash = await computeSha512(source)
      if (hash !== entry.sha512) {
        throw new Error(
          'ハッシュ不一致: ソースが改ざんされている可能性があります',
        )
      }

      // Parse and validate
      const meta = parsePluginMeta(source)
      if (!meta) {
        throw new Error('プラグインメタデータの解析に失敗しました')
      }

      const pluginsStore = usePluginsStore()
      if (pluginsStore.isDuplicate(meta.name)) {
        throw new Error(`"${meta.name}" は既にインストールされています`)
      }

      const configData: Record<string, unknown> = {}
      if (meta.config) {
        for (const [key, def] of Object.entries(meta.config)) {
          configData[key] = def.default
        }
      }

      const newPlugin: PluginMeta = {
        installId: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: meta.name,
        version: meta.version,
        author: meta.author,
        description: meta.description,
        permissions: meta.permissions,
        config: meta.config,
        configData,
        src: source,
        active: true,
      }

      pluginsStore.addPlugin(newPlugin)
      await launchPlugin(newPlugin)
    } finally {
      installing.value = null
    }
  }

  // --- Install theme ---

  async function installTheme(entry: StoreThemeEntry): Promise<void> {
    installingTheme.value = entry.id
    try {
      const res = await fetch(entry.sourceUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const source = await res.text()

      // SHA-512 verification
      const hash = await computeSha512(source)
      if (hash !== entry.sha512) {
        throw new Error(
          'ハッシュ不一致: ソースが改ざんされている可能性があります',
        )
      }

      const themeStore = useThemeStore()

      const ok = await themeStore.installTheme(source)
      if (!ok) {
        throw new Error('テーマのインストールに失敗しました')
      }
    } finally {
      installingTheme.value = null
    }
  }

  // --- Installed check ---

  function isInstalled(entry: StorePluginEntry): boolean {
    const pluginsStore = usePluginsStore()
    return pluginsStore.plugins.some((p) => p.name === entry.name)
  }

  function isThemeInstalled(entry: StoreThemeEntry): boolean {
    const themeStore = useThemeStore()
    return themeStore.installedThemes.some((t) => t.name === entry.name)
  }

  const installedNames = computed(() => {
    const pluginsStore = usePluginsStore()
    return new Set(pluginsStore.plugins.map((p) => p.name))
  })

  return {
    plugins,
    loading,
    error,
    installing,
    themes,
    themesLoading,
    themesError,
    installingTheme,
    widgets,
    widgetsLoading,
    widgetsError,
    fetchPlugins,
    fetchThemes,
    fetchWidgets,
    fetchWidgetSource,
    refresh,
    refreshThemes,
    refreshWidgets,
    installPlugin,
    installTheme,
    isInstalled,
    isThemeInstalled,
    installedNames,
  }
})
