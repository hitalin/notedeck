import { ref } from 'vue'
import defaultAiPrompt from '@/defaults/AI.md?raw'
import { useSettingsStore } from '@/stores/settings'
import { isTauri, readAiSettings } from '@/utils/settingsFs'
import { getStorageJson, STORAGE_KEYS, setStorageJson } from '@/utils/storage'

// --- Type definitions ---

export interface ProviderSettings {
  endpoint: string
  apiKey: string
  model: string
}

export type ProviderKey = 'ollama' | 'openai' | 'custom'

export interface AiConfig {
  provider: ProviderKey
  ollama: ProviderSettings
  openai: ProviderSettings
  custom: ProviderSettings
  systemPrompt: string
}

/**
 * File / settings-backed shape of AI config.
 *
 * **API keys are intentionally excluded** — they live in localStorage only
 * for security (not in `ai.json`, not in `settings.json`, not in backups).
 */
export type AiFileConfig = Omit<AiConfig, 'ollama' | 'openai' | 'custom'> & {
  ollama: Omit<ProviderSettings, 'apiKey'>
  openai: Omit<ProviderSettings, 'apiKey'>
  custom: Omit<ProviderSettings, 'apiKey'>
}

export const PROVIDER_KEYS: readonly ProviderKey[] = [
  'ollama',
  'openai',
  'custom',
]

const STORAGE_KEY = STORAGE_KEYS.aiSettings

// --- Defaults ---

function defaultProviderSettings(): Record<ProviderKey, ProviderSettings> {
  return {
    ollama: {
      endpoint: 'http://localhost:11434',
      apiKey: '',
      model: '',
    },
    openai: {
      endpoint: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-4o',
    },
    custom: { endpoint: '', apiKey: '', model: '' },
  }
}

export function defaultConfig(): AiConfig {
  const providers = defaultProviderSettings()
  return {
    provider: 'ollama',
    ...providers,
    systemPrompt: defaultAiPrompt,
  }
}

// --- Merge / strip ---

/** Deep-merge partial config into defaults, preserving nested provider fields. */
function mergeConfig(base: AiConfig, partial: Partial<AiConfig>): AiConfig {
  const result = { ...base, ...partial }
  for (const key of PROVIDER_KEYS) {
    result[key] = { ...base[key], ...(partial[key] ?? {}) }
  }
  return result
}

/** Strip apiKey from each provider for file backup. */
function toFileConfig(c: AiConfig): AiFileConfig {
  const result = {
    provider: c.provider,
    systemPrompt: c.systemPrompt,
  } as AiFileConfig
  for (const key of PROVIDER_KEYS) {
    const { apiKey: _, ...safe } = c[key]
    result[key] = safe
  }
  return result
}

/** Read API keys from localStorage (never stored in files). */
function loadApiKeys(): Record<ProviderKey, string> {
  const stored = getStorageJson<Partial<AiConfig> | null>(STORAGE_KEY, null)
  if (!stored) return { ollama: '', openai: '', custom: '' }
  return {
    ollama: stored.ollama?.apiKey ?? '',
    openai: stored.openai?.apiKey ?? '',
    custom: stored.custom?.apiKey ?? '',
  }
}

// --- Composable ---

export function useAiConfig() {
  const settingsStore = useSettingsStore()

  // Build initial config: settingsStore (non-API parts) + localStorage (API keys)
  function buildConfig(): AiConfig {
    const stored = settingsStore.get('ai')
    const base = stored
      ? mergeConfig(defaultConfig(), stored as Partial<AiConfig>)
      : defaultConfig()
    const keys = loadApiKeys()
    for (const k of PROVIDER_KEYS) {
      base[k].apiKey = keys[k]
    }
    return base
  }

  const config = ref<AiConfig>(buildConfig())
  const initialized = ref(false)

  function save(): void {
    // Non-API parts → settingsStore (single source of truth → settings.json)
    settingsStore.set('ai', toFileConfig(config.value))
    // API keys → localStorage only (security)
    setStorageJson(STORAGE_KEY, config.value)
  }

  /**
   * Legacy migration: read ai.json once and seed settingsStore if it doesn't
   * already have AI config (first run after migration).
   */
  async function initFileStorage(): Promise<void> {
    if (!settingsStore.get('ai')) {
      const content = await readAiSettings()
      if (content) {
        try {
          const parsed = JSON.parse(content) as Partial<AiConfig>
          const fileConfig = toFileConfig(mergeConfig(defaultConfig(), parsed))
          settingsStore.set('ai', fileConfig)
          // Re-build config from the newly seeded settingsStore
          config.value = buildConfig()
        } catch (e) {
          console.warn('[ai-settings] failed to parse ai.json:', e)
        }
      }
    }
    initialized.value = true
  }

  if (isTauri) {
    initFileStorage()
  }

  return { config, save, mergeConfig, toFileConfig }
}
