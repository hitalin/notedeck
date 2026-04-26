import JSON5 from 'json5'
import { ref } from 'vue'
import defaultAiJson5 from '@/defaults/ai.json5?raw'
import { isTauri, readAiSettings, writeAiSettings } from '@/utils/settingsFs'
import { getStorageJson, removeStorage, STORAGE_KEYS } from '@/utils/storage'
import { commands, unwrap } from '@/utils/tauriInvoke'

// --- Type definitions ---

export interface ProviderSettings {
  endpoint: string
  model: string
}

export type ProviderKey = 'anthropic' | 'openai' | 'custom'

export interface AiConfig {
  provider: ProviderKey
  anthropic: ProviderSettings
  openai: ProviderSettings
  custom: ProviderSettings
}

export const PROVIDER_KEYS: readonly ProviderKey[] = [
  'anthropic',
  'openai',
  'custom',
]

// --- Defaults (loaded from src/defaults/ai.json5) ---

const defaultFileConfig: AiConfig = JSON5.parse(defaultAiJson5)

export function defaultConfig(): AiConfig {
  return {
    provider: defaultFileConfig.provider,
    anthropic: { ...defaultFileConfig.anthropic },
    openai: { ...defaultFileConfig.openai },
    custom: { ...defaultFileConfig.custom },
  }
}

// --- Merge ---

/** Deep-merge partial config into defaults, preserving nested provider fields. */
function mergeConfig(base: AiConfig, partial: Partial<AiConfig>): AiConfig {
  const result = { ...base, ...partial }
  for (const key of PROVIDER_KEYS) {
    result[key] = { ...base[key], ...(partial[key] ?? {}) }
  }
  return result
}

// --- API keys (OS keychain via notecli::keychain) ---
//
// API keys are stored in the OS keychain (same mechanism as Misskey tokens),
// keyed by `ai.<provider>`. The frontend never receives the key body — only
// a boolean status — so DevTools and XSS cannot exfiltrate it.

export async function setApiKey(
  provider: ProviderKey,
  key: string,
): Promise<void> {
  unwrap(await commands.aiSetApiKey(provider, key))
}

export async function getApiKeyStatus(provider: ProviderKey): Promise<boolean> {
  return unwrap(await commands.aiGetApiKeyStatus(provider))
}

export async function deleteApiKey(provider: ProviderKey): Promise<void> {
  unwrap(await commands.aiDeleteApiKey(provider))
}

// --- Migration: localStorage → keychain (one-shot) ---

interface LegacyAiConfig {
  anthropic?: { apiKey?: string }
  openai?: { apiKey?: string }
  custom?: { apiKey?: string }
}

async function migrateFromLocalStorageOnce(): Promise<void> {
  const legacy = getStorageJson<LegacyAiConfig | null>(
    STORAGE_KEYS.aiSettings,
    null,
  )
  if (!legacy) return
  for (const k of PROVIDER_KEYS) {
    const apiKey = legacy[k]?.apiKey
    if (!apiKey) continue
    try {
      await setApiKey(k, apiKey)
    } catch (e) {
      console.warn(`[ai-settings] keychain migration failed for ${k}:`, e)
    }
  }
  removeStorage(STORAGE_KEYS.aiSettings)
}

// --- Composable ---

export function useAiConfig() {
  const config = ref<AiConfig>(defaultConfig())
  const initialized = ref(false)

  function save(): void {
    writeAiSettings(`${JSON5.stringify(config.value, null, 2)}\n`).catch((e) =>
      console.warn('[ai-settings] failed to write ai.json5:', e),
    )
  }

  async function initFileStorage(): Promise<void> {
    await migrateFromLocalStorageOnce()
    const aiContent = await readAiSettings()
    if (aiContent) {
      try {
        const parsed = JSON5.parse(aiContent) as Partial<AiConfig>
        config.value = mergeConfig(defaultConfig(), parsed)
      } catch (e) {
        console.warn('[ai-settings] failed to parse ai.json5:', e)
        config.value = defaultConfig()
      }
    } else {
      config.value = defaultConfig()
    }
    initialized.value = true
  }

  if (isTauri) {
    initFileStorage()
  }

  return { config, save, mergeConfig, initialized }
}
