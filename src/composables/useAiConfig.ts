import JSON5 from 'json5'
import { ref } from 'vue'
import defaultAiPrompt from '@/defaults/AI.md?raw'
import {
  isTauri,
  readAiPrompt,
  readAiSettings,
  writeAiPrompt,
  writeAiSettings,
} from '@/utils/settingsFs'
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
 * File-backed shape of AI config (written to ai.json5).
 *
 * **API keys are intentionally excluded** — they live in localStorage only
 * for security (not in `ai.json5`, not in `settings.json5`, not in backups).
 *
 * **systemPrompt is excluded** — it lives in `AI.md` as a separate file.
 */
export type AiFileConfig = Omit<
  AiConfig,
  'ollama' | 'openai' | 'custom' | 'systemPrompt'
> & {
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

/** Strip apiKey and systemPrompt from config for ai.json5 backup. */
function toFileConfig(c: AiConfig): AiFileConfig {
  const result = {
    provider: c.provider,
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
  const config = ref<AiConfig>(defaultConfig())
  const initialized = ref(false)

  // Apply API keys from localStorage into a config
  function applyApiKeys(c: AiConfig): AiConfig {
    const keys = loadApiKeys()
    for (const k of PROVIDER_KEYS) {
      c[k].apiKey = keys[k]
    }
    return c
  }

  function save(): void {
    // ai.json5 (non-API, non-prompt parts)
    const fileConfig = toFileConfig(config.value)
    writeAiSettings(`${JSON5.stringify(fileConfig, null, 2)}\n`).catch((e) =>
      console.warn('[ai-settings] failed to write ai.json5:', e),
    )

    // AI.md (system prompt — only write if different from default)
    if (config.value.systemPrompt !== defaultAiPrompt) {
      writeAiPrompt(config.value.systemPrompt).catch((e) =>
        console.warn('[ai-settings] failed to write AI.md:', e),
      )
    }

    // API keys → localStorage only (security)
    setStorageJson(STORAGE_KEY, config.value)
  }

  /**
   * Initialize from file storage:
   * 1. Read ai.json5 (fallback: legacy ai.json)
   * 2. Read AI.md for system prompt
   * 3. If nothing found, migrate from settingsStore ai key
   * 4. Write ai.json5 after migration, remove ai from settingsStore
   */
  async function initFileStorage(): Promise<void> {
    let loaded = false

    // Try reading ai.json5 (with fallback to ai.json)
    const aiContent = await readAiSettings()
    if (aiContent) {
      try {
        const parsed = JSON5.parse(aiContent) as Partial<AiConfig>
        config.value = applyApiKeys(mergeConfig(defaultConfig(), parsed))
        loaded = true
      } catch (e) {
        console.warn('[ai-settings] failed to parse ai.json5:', e)
      }
    }

    // If no file found, try migrating from settingsStore
    if (!loaded) {
      try {
        // Dynamic import to avoid circular dependency / hard coupling
        const { useSettingsStore } = await import('@/stores/settings')
        const settingsStore = useSettingsStore()
        // settingsStore.settings is auto-unwrapped by Pinia (NotedeckSettings),
        // but the ai key was removed from the type — cast to access legacy data
        const rawSettings = settingsStore.settings as unknown as Record<
          string,
          unknown
        >
        const legacyAi = rawSettings.ai
        if (legacyAi && typeof legacyAi === 'object') {
          const parsed = legacyAi as Partial<AiConfig>
          config.value = applyApiKeys(mergeConfig(defaultConfig(), parsed))
          // Write to ai.json5
          const fileConfig = toFileConfig(config.value)
          await writeAiSettings(`${JSON5.stringify(fileConfig, null, 2)}\n`)
          loaded = true
        }
      } catch {
        // settingsStore migration failed — continue with defaults
      }
    }

    if (!loaded) {
      config.value = applyApiKeys(defaultConfig())
    }

    // Read AI.md for system prompt (overrides whatever was loaded above)
    const promptContent = await readAiPrompt()
    if (promptContent) {
      config.value = { ...config.value, systemPrompt: promptContent }
    } else if (loaded && config.value.systemPrompt !== defaultAiPrompt) {
      // AI.md doesn't exist but config has a custom prompt — write it out
      await writeAiPrompt(config.value.systemPrompt).catch((e) =>
        console.warn('[ai-settings] failed to write AI.md:', e),
      )
    }

    initialized.value = true
  }

  if (isTauri) {
    initFileStorage()
  }

  return { config, save, mergeConfig, toFileConfig }
}
