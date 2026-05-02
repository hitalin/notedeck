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

export type PresetKey = 'readonly' | 'safe' | 'full' | 'custom'

export const PRESET_KEYS: readonly PresetKey[] = [
  'readonly',
  'safe',
  'full',
  'custom',
]

export const PERMISSION_KEYS = [
  'notes.read',
  'notes.write',
  'notes.react',
  'account.read',
  'account.write',
  'drive.read',
  'drive.write',
  'network.external',
  'clipboard',
  'notifications',
] as const
export type PermissionKey = (typeof PERMISSION_KEYS)[number]

/**
 * 高リスク権限。Phase 1 では UI に warning アイコンを出すだけ。
 * Phase 5 で確認ダイアログによる enforcement を導入する。
 */
export const HIGH_RISK_PERMISSION_KEYS: readonly PermissionKey[] = [
  'notes.write',
  'account.write',
  'drive.write',
  'network.external',
]

export const DATA_SOURCE_KEYS = [
  'currentAccount',
  'currentColumn',
  'visibleNotes',
  'recentConversation',
] as const
export type DataSourceKey = (typeof DATA_SOURCE_KEYS)[number]

export interface PermissionsConfig {
  preset: PresetKey
  custom: Record<PermissionKey, boolean>
}

export interface DataSourcesConfig {
  preset: PresetKey
  custom: Record<DataSourceKey, boolean>
}

// --- Heartbeat (Phase 6, #411) ---

/** tick 間隔の最小 / 最大 / デフォルト (分単位)。 */
// 1 分まで下げると API コスト増大に注意 (= デバッグ / アクティブ監視用想定)。
export const HEARTBEAT_INTERVAL_MIN_MINUTES = 1
export const HEARTBEAT_INTERVAL_MAX_MINUTES = 24 * 60
export const HEARTBEAT_INTERVAL_DEFAULT_MINUTES = 30

/**
 * HEARTBEAT_OK 抑制で残りテキストがこの長さ以下なら全体を drop する。
 * OpenClaw の `ackMaxChars` (default 300) と揃える。
 */
export const HEARTBEAT_ACK_MAX_CHARS = 300

/**
 * 出力先 AI session の routing。OpenClaw HEARTBEAT の `target` と同概念。
 * - `'auto'`: kind='heartbeat' の専用 session を auto-create + 永続使用 (default)
 * - `'none'`: session に append しない (= silent log only)
 * - 任意の文字列 (= session id): 既存 session に明示 pin
 */
export type HeartbeatTarget = 'auto' | 'none' | string

export interface HeartbeatConfig {
  /** false なら daemon は何もしない (default) */
  enabled: boolean
  /** tick 間隔 (分)。MIN <= x <= MAX に clamp */
  intervalMinutes: number
  /**
   * Tick 結果の出力先 AI session。詳細は {@link HeartbeatTarget}。
   * default: `'auto'` (= 専用 Heartbeat session を自動管理)
   */
  target: HeartbeatTarget
  /**
   * HEARTBEAT 中の AI に許可する権限。チャットセッションの権限
   * (`AiConfig.permissions`) とは独立に管理し、AI が暴走しないよう
   * default は `readonly` preset (write 系 / external network 全部 deny)。
   *
   * runner 側で `resolvePermissions()` してから capability の
   * `permissions[]` (required) と照合し、満たさないものを tool 一覧から除外。
   */
  permissions: PermissionsConfig
}

/**
 * どの skill を heartbeat 対象として実行するかは `SkillMeta.heartbeat` に記録
 * される (= skill 側の責務、ai.json5 では持たない)。MisStore 配布側で
 * frontmatter に `heartbeat: true` を含めて配布できる + ユーザーは
 * スキルカラムから個別に on/off できる。
 */

export interface AiConfig {
  provider: ProviderKey
  anthropic: ProviderSettings
  openai: ProviderSettings
  custom: ProviderSettings
  permissions: PermissionsConfig
  dataSources: DataSourcesConfig
  heartbeat: HeartbeatConfig
}

export const PROVIDER_KEYS: readonly ProviderKey[] = [
  'anthropic',
  'openai',
  'custom',
]

// --- Preset definitions ---

type ResolvedPreset = Exclude<PresetKey, 'custom'>

const PERMISSION_PRESETS: Record<
  ResolvedPreset,
  Record<PermissionKey, boolean>
> = {
  readonly: {
    'notes.read': true,
    'notes.write': false,
    'notes.react': false,
    'account.read': true,
    'account.write': false,
    'drive.read': true,
    'drive.write': false,
    'network.external': false,
    clipboard: false,
    notifications: false,
  },
  safe: {
    'notes.read': true,
    'notes.write': false,
    'notes.react': true,
    'account.read': true,
    'account.write': false,
    'drive.read': true,
    'drive.write': false,
    'network.external': false,
    clipboard: true,
    notifications: true,
  },
  full: {
    'notes.read': true,
    'notes.write': true,
    'notes.react': true,
    'account.read': true,
    'account.write': true,
    'drive.read': true,
    'drive.write': true,
    'network.external': true,
    clipboard: true,
    notifications: true,
  },
}

const DATA_SOURCE_PRESETS: Record<
  ResolvedPreset,
  Record<DataSourceKey, boolean>
> = {
  readonly: {
    currentAccount: true,
    currentColumn: true,
    visibleNotes: false,
    recentConversation: false,
  },
  safe: {
    currentAccount: true,
    currentColumn: true,
    visibleNotes: true,
    recentConversation: true,
  },
  full: {
    currentAccount: true,
    currentColumn: true,
    visibleNotes: true,
    recentConversation: true,
  },
}

/**
 * Resolve permission map for a config (custom returns its own custom map).
 * Used at consumption time (UI / system prompt builder).
 */
export function resolvePermissions(
  cfg: PermissionsConfig,
): Record<PermissionKey, boolean> {
  if (cfg.preset === 'custom') return { ...cfg.custom }
  return { ...PERMISSION_PRESETS[cfg.preset] }
}

export function resolveDataSources(
  cfg: DataSourcesConfig,
): Record<DataSourceKey, boolean> {
  if (cfg.preset === 'custom') return { ...cfg.custom }
  return { ...DATA_SOURCE_PRESETS[cfg.preset] }
}

/**
 * Switch preset. When switching to 'custom', pre-fill the custom map with
 * the previously resolved values so the user starts from where they were
 * (instead of from an empty / all-false state).
 */
export function setPermissionPreset(
  cfg: PermissionsConfig,
  next: PresetKey,
): PermissionsConfig {
  if (next === 'custom') {
    return { preset: 'custom', custom: resolvePermissions(cfg) }
  }
  return { preset: next, custom: { ...PERMISSION_PRESETS[next] } }
}

export function setDataSourcePreset(
  cfg: DataSourcesConfig,
  next: PresetKey,
): DataSourcesConfig {
  if (next === 'custom') {
    return { preset: 'custom', custom: resolveDataSources(cfg) }
  }
  return { preset: next, custom: { ...DATA_SOURCE_PRESETS[next] } }
}

// --- Defaults (loaded from src/defaults/ai.json5) ---

const defaultFileConfig: AiConfig = JSON5.parse(defaultAiJson5)

export function defaultConfig(): AiConfig {
  return {
    provider: defaultFileConfig.provider,
    anthropic: { ...defaultFileConfig.anthropic },
    openai: { ...defaultFileConfig.openai },
    custom: { ...defaultFileConfig.custom },
    permissions: {
      preset: defaultFileConfig.permissions.preset,
      custom: { ...defaultFileConfig.permissions.custom },
    },
    dataSources: {
      preset: defaultFileConfig.dataSources.preset,
      custom: { ...defaultFileConfig.dataSources.custom },
    },
    heartbeat: {
      enabled: defaultFileConfig.heartbeat.enabled,
      intervalMinutes: defaultFileConfig.heartbeat.intervalMinutes,
      target: defaultFileConfig.heartbeat.target,
      permissions: {
        preset: defaultFileConfig.heartbeat.permissions.preset,
        custom: { ...defaultFileConfig.heartbeat.permissions.custom },
      },
    },
  }
}

/**
 * 設定値の sanity 補正。intervalMinutes を MIN〜MAX に clamp、
 * denyDuringHeartbeat は string[] として保持。
 */
export function normalizeHeartbeatConfig(
  cfg: HeartbeatConfig,
): HeartbeatConfig {
  const interval = Number.isFinite(cfg.intervalMinutes)
    ? Math.max(
        HEARTBEAT_INTERVAL_MIN_MINUTES,
        Math.min(
          HEARTBEAT_INTERVAL_MAX_MINUTES,
          Math.floor(cfg.intervalMinutes),
        ),
      )
    : HEARTBEAT_INTERVAL_DEFAULT_MINUTES
  // target は文字列なら何でも受け取る ('auto' / 'none' / 任意 session id)。
  // 空文字 / null / undefined は 'auto' にフォールバック。
  const target: HeartbeatTarget =
    typeof cfg.target === 'string' && cfg.target.length > 0
      ? cfg.target
      : 'auto'
  return {
    enabled: !!cfg.enabled,
    intervalMinutes: interval,
    target,
    permissions: cfg.permissions,
  }
}

// --- Merge ---

function mergePermissions(
  base: PermissionsConfig,
  partial: Partial<PermissionsConfig> | undefined,
): PermissionsConfig {
  return {
    preset: partial?.preset ?? base.preset,
    custom: { ...base.custom, ...(partial?.custom ?? {}) },
  }
}

function mergeDataSources(
  base: DataSourcesConfig,
  partial: Partial<DataSourcesConfig> | undefined,
): DataSourcesConfig {
  return {
    preset: partial?.preset ?? base.preset,
    custom: { ...base.custom, ...(partial?.custom ?? {}) },
  }
}

function mergeHeartbeat(
  base: HeartbeatConfig,
  partial: Partial<HeartbeatConfig> | undefined,
): HeartbeatConfig {
  return normalizeHeartbeatConfig({
    enabled: partial?.enabled ?? base.enabled,
    intervalMinutes: partial?.intervalMinutes ?? base.intervalMinutes,
    target: partial?.target ?? base.target,
    permissions: mergePermissions(base.permissions, partial?.permissions),
  })
}

/** Deep-merge partial config into defaults, preserving nested provider fields. */
function mergeConfig(base: AiConfig, partial: Partial<AiConfig>): AiConfig {
  const result = { ...base, ...partial }
  for (const key of PROVIDER_KEYS) {
    result[key] = { ...base[key], ...(partial[key] ?? {}) }
  }
  result.permissions = mergePermissions(base.permissions, partial.permissions)
  result.dataSources = mergeDataSources(base.dataSources, partial.dataSources)
  result.heartbeat = mergeHeartbeat(base.heartbeat, partial.heartbeat)
  return result
}

// --- API keys (OS keychain via notecli::keychain) ---
//
// API keys are stored in the OS keychain (same mechanism as Misskey tokens),
// keyed by `ai.<provider>`. The frontend never receives the key body — only
// a boolean status — so DevTools and XSS cannot exfiltrate it.

/**
 * Module-scoped counter that increments on every API key mutation. Composables
 * can `watch()` it to react to keychain changes (e.g. re-checking provider
 * status after a key is set/cleared).
 */
const apiKeyChangeCounter = ref(0)

export function watchApiKeyChanges() {
  return apiKeyChangeCounter
}

export async function setApiKey(
  provider: ProviderKey,
  key: string,
): Promise<void> {
  unwrap(await commands.aiSetApiKey(provider, key))
  apiKeyChangeCounter.value++
}

export async function getApiKeyStatus(provider: ProviderKey): Promise<boolean> {
  return unwrap(await commands.aiGetApiKeyStatus(provider))
}

export async function deleteApiKey(provider: ProviderKey): Promise<void> {
  unwrap(await commands.aiDeleteApiKey(provider))
  apiKeyChangeCounter.value++
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

// --- Exposed for tests ---

export const _internal = {
  mergeConfig,
  PERMISSION_PRESETS,
  DATA_SOURCE_PRESETS,
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
