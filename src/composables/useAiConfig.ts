import { ref, watch } from 'vue'
import defaultAiPrompt from '@/defaults/AI.md?raw'
import { useSettingsStore } from '@/stores/settings'
import { isTauri, readAiSettings, writeAiSettings } from '@/utils/settingsFs'
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
function toFileConfig(c: AiConfig): Record<string, unknown> {
  const result: Record<string, unknown> = {
    provider: c.provider,
    systemPrompt: c.systemPrompt,
  }
  for (const key of PROVIDER_KEYS) {
    const { apiKey: _, ...safe } = c[key]
    result[key] = safe
  }
  return result
}

// --- Composable ---

export function useAiConfig() {
  const settingsStore = useSettingsStore()

  function load(): AiConfig {
    const stored = getStorageJson<Partial<AiConfig> | null>(STORAGE_KEY, null)
    return stored ? mergeConfig(defaultConfig(), stored) : defaultConfig()
  }

  const config = ref<AiConfig>(load())
  const initialized = ref(false)

  /**
   * Mirror the current config (without API keys) to settings.json so AI
   * settings are included in backup / cross-device sync. API keys remain
   * in localStorage only — they are **never** written to any file.
   *
   * Guarded by `settingsStore.initialized` to avoid racing the initial load.
   */
  function mirrorToSettingsStore(): void {
    if (!settingsStore.initialized) return
    settingsStore.set('ai', toFileConfig(config.value) as AiFileConfig)
  }

  function save(): void {
    setStorageJson(STORAGE_KEY, config.value)
    mirrorToSettingsStore()
    if (initialized.value) {
      persistToFile().catch((e) =>
        console.warn('[ai-settings] failed to persist to file:', e),
      )
    }
  }

  async function persistToFile(): Promise<void> {
    const content = JSON.stringify(toFileConfig(config.value), null, 2)
    await writeAiSettings(content)
  }

  async function initFileStorage(): Promise<void> {
    const content = await readAiSettings()
    if (content) {
      try {
        const parsed = JSON.parse(content) as Partial<AiConfig>
        const secrets = Object.fromEntries(
          PROVIDER_KEYS.map((k) => [k, config.value[k].apiKey]),
        )
        config.value = mergeConfig(defaultConfig(), parsed)
        for (const k of PROVIDER_KEYS) {
          config.value[k].apiKey = secrets[k] ?? ''
        }
        setStorageJson(STORAGE_KEY, config.value)
      } catch (e) {
        console.warn('[ai-settings] failed to parse ai.json:', e)
      }
    }
    initialized.value = true
    if (!content && config.value !== defaultConfig()) {
      persistToFile().catch((e) =>
        console.warn('[ai-settings] migration to file failed:', e),
      )
    }
  }

  if (isTauri) {
    initFileStorage()
  }

  /**
   * Reconcile with settings.json once settingsStore finishes loading:
   * - If settings.json has `ai` config, merge it into the local config
   *   (API keys from localStorage are preserved)
   * - Otherwise, seed settings.json from the current local config
   */
  watch(
    () => settingsStore.initialized,
    (done) => {
      if (!done) return
      const stored = settingsStore.get('ai')
      if (stored != null) {
        // Preserve API keys from current local state
        const secrets = Object.fromEntries(
          PROVIDER_KEYS.map((k) => [k, config.value[k].apiKey]),
        )
        config.value = mergeConfig(defaultConfig(), stored as Partial<AiConfig>)
        for (const k of PROVIDER_KEYS) {
          config.value[k].apiKey = secrets[k] ?? ''
        }
        setStorageJson(STORAGE_KEY, config.value)
      } else {
        // Seed settings.json from current local state (one-time migration)
        mirrorToSettingsStore()
      }
    },
    { immediate: true },
  )

  return { config, save, mergeConfig, toFileConfig }
}
