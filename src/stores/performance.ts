import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import defaultsJson from '@/defaults/performance.json'
import { isTauri, readPerformance, writePerformance } from '@/utils/settingsFs'
import { getStorageJson, STORAGE_KEYS, setStorageJson } from '@/utils/storage'
import { invoke } from '@/utils/tauriInvoke'

/** All tunable performance keys. */
export interface PerformanceConfig {
  // Emoji cache
  emojiCachePerHost: number
  emojiListHosts: number
  emojiPersistPerHost: number
  // Notes
  noteStoreMax: number
  noteListMax: number
  maxNotifications: number
  // Parse cache
  mfmCacheMax: number
  imageProxyCacheMax: number
  ogpCacheMax: number
  // Realtime
  noteCaptureMax: number
  overscan: number
  prefetchAhead: number
  prefetchBehind: number
  // Rust: backend
  memoryCacheMaxMB: number
  memoryCacheMaxItemKB: number
  maxConcurrentFetches: number
  rustOgpCacheMax: number
  maxRequestsPerWindow: number
  circuitBreakerThreshold: number
  circuitBreakerDuration: number
  imageCacheTTLDays: number
}

export type PerformanceKey = keyof PerformanceConfig

/** Metadata for each setting (used by the editor UI and validation). */
export interface FieldMeta {
  min: number
  max: number
  step: number
  unit: string
  category: string
  label: string
  description: string
}

export const FIELD_META: Record<PerformanceKey, FieldMeta> = {
  emojiCachePerHost: {
    min: 500,
    max: 10000,
    step: 500,
    unit: '件',
    category: 'emoji',
    label: '絵文字キャッシュ/ホスト',
    description:
      'ホストあたりのカスタム絵文字キャッシュ数。大規模サーバーは5000+の絵文字を持つ',
  },
  emojiListHosts: {
    min: 1,
    max: 10,
    step: 1,
    unit: 'ホスト',
    category: 'emoji',
    label: 'リスト保持ホスト数',
    description: 'リアクションピッカー用の絵文字リストを保持するホスト数',
  },
  emojiPersistPerHost: {
    min: 50,
    max: 1000,
    step: 50,
    unit: '件',
    category: 'emoji',
    label: 'localStorage永続化/ホスト',
    description: 'オフライン時の絵文字解決用にlocalStorageに保存するエントリ数',
  },
  noteStoreMax: {
    min: 500,
    max: 10000,
    step: 500,
    unit: '件',
    category: 'note',
    label: 'ノートストア上限',
    description:
      'グローバルノートストアの保持上限。長時間セッションのメモリ消費に影響',
  },
  noteListMax: {
    min: 50,
    max: 1000,
    step: 50,
    unit: '件',
    category: 'note',
    label: 'DOM表示上限/カラム',
    description: 'カラムあたりのデータ配列上限。超過分はスクロール時に破棄',
  },
  maxNotifications: {
    min: 100,
    max: 1000,
    step: 100,
    unit: '件',
    category: 'note',
    label: '通知保持上限',
    description: '通知カラムに保持する通知の最大数',
  },
  mfmCacheMax: {
    min: 32,
    max: 2048,
    step: 32,
    unit: '件',
    category: 'cache',
    label: 'MFMキャッシュ',
    description: 'MFMパース結果のLRUキャッシュ上限',
  },
  imageProxyCacheMax: {
    min: 32,
    max: 2048,
    step: 32,
    unit: '件',
    category: 'cache',
    label: 'プロキシURLキャッシュ',
    description: 'プロキシURL変換のLRUキャッシュ上限',
  },
  ogpCacheMax: {
    min: 32,
    max: 1024,
    step: 32,
    unit: '件',
    category: 'cache',
    label: 'OGPキャッシュ',
    description: 'OGPプレビューのLRUキャッシュ上限',
  },
  noteCaptureMax: {
    min: 10,
    max: 200,
    step: 10,
    unit: '件',
    category: 'realtime',
    label: 'Note Capture上限',
    description:
      'リアルタイム更新のWebSocket購読数。多いほどリアクション即時反映',
  },
  overscan: {
    min: 2,
    max: 20,
    step: 1,
    unit: '件',
    category: 'realtime',
    label: 'Overscan',
    description:
      'viewport外に余分に描画するノート数。多いほどスクロールが滑らか',
  },
  memoryCacheMaxMB: {
    min: 1,
    max: 32,
    step: 1,
    unit: 'MB',
    category: 'backend',
    label: 'メモリキャッシュ合計',
    description: '画像のインメモリキャッシュ合計サイズ',
  },
  memoryCacheMaxItemKB: {
    min: 16,
    max: 256,
    step: 16,
    unit: 'KB',
    category: 'backend',
    label: '単一ファイル上限',
    description: 'メモリキャッシュに載せる単一ファイルの最大サイズ',
  },
  maxConcurrentFetches: {
    min: 5,
    max: 100,
    step: 5,
    unit: '並列',
    category: 'backend',
    label: '並行フェッチ数',
    description: '画像の同時ダウンロード数',
  },
  rustOgpCacheMax: {
    min: 16,
    max: 512,
    step: 16,
    unit: '件',
    category: 'backend',
    label: 'Rust OGPキャッシュ',
    description: 'Rust側のOGPメタデータLRUキャッシュ上限',
  },
  maxRequestsPerWindow: {
    min: 50,
    max: 500,
    step: 50,
    unit: 'req/min',
    category: 'backend',
    label: 'レート制限',
    description: 'ホストあたりの1分間リクエスト上限',
  },
  circuitBreakerThreshold: {
    min: 2,
    max: 10,
    step: 1,
    unit: '回',
    category: 'backend',
    label: 'サーキットブレーカー閾値',
    description: 'この回数連続失敗でホストを一時遮断',
  },
  circuitBreakerDuration: {
    min: 10,
    max: 300,
    step: 10,
    unit: '秒',
    category: 'backend',
    label: 'サーキットブレーカー期間',
    description: '遮断されたホストの復帰までの待機時間',
  },
  imageCacheTTLDays: {
    min: 1,
    max: 30,
    step: 1,
    unit: '日',
    category: 'backend',
    label: '画像キャッシュ有効期限',
    description: 'ディスク上の画像キャッシュの保持日数',
  },
  prefetchAhead: {
    min: 0,
    max: 60,
    step: 5,
    unit: '件',
    category: 'realtime',
    label: '先読みプリフェッチ',
    description: 'viewport下方向に先読みする画像プリフェッチ数',
  },
  prefetchBehind: {
    min: 0,
    max: 30,
    step: 5,
    unit: '件',
    category: 'realtime',
    label: '後方プリフェッチ',
    description: 'viewport上方向に遡って画像プリフェッチする数',
  },
}

export const CATEGORY_LABELS: Record<string, { label: string; icon: string }> =
  {
    emoji: { label: '絵文字キャッシュ', icon: 'ti-mood-smile' },
    note: { label: 'ノート', icon: 'ti-note' },
    cache: { label: 'パースキャッシュ', icon: 'ti-database' },
    realtime: { label: 'リアルタイム', icon: 'ti-bolt' },
    backend: { label: 'バックエンド', icon: 'ti-server' },
  }

/** Preset definitions. */
export const PRESETS = {
  low: {
    label: '省メモリ',
    icon: 'ti-leaf',
    values: {
      emojiCachePerHost: 1000,
      emojiListHosts: 2,
      emojiPersistPerHost: 100,
      noteStoreMax: 500,
      noteListMax: 100,
      maxNotifications: 100,
      mfmCacheMax: 64,
      imageProxyCacheMax: 64,
      ogpCacheMax: 32,
      noteCaptureMax: 20,
      overscan: 3,
      memoryCacheMaxMB: 2,
      memoryCacheMaxItemKB: 32,
      maxConcurrentFetches: 10,
      rustOgpCacheMax: 32,
      maxRequestsPerWindow: 100,
      circuitBreakerThreshold: 3,
      circuitBreakerDuration: 90,
      imageCacheTTLDays: 3,
      prefetchAhead: 10,
      prefetchBehind: 5,
    } satisfies PerformanceConfig,
  },
  balanced: {
    label: 'バランス',
    icon: 'ti-scale',
    values: null, // = defaults
  },
  high: {
    label: '高パフォーマンス',
    icon: 'ti-rocket',
    values: {
      emojiCachePerHost: 5000,
      emojiListHosts: 5,
      emojiPersistPerHost: 500,
      noteStoreMax: 5000,
      noteListMax: 500,
      maxNotifications: 500,
      mfmCacheMax: 1024,
      imageProxyCacheMax: 1024,
      ogpCacheMax: 512,
      noteCaptureMax: 100,
      overscan: 12,
      memoryCacheMaxMB: 16,
      memoryCacheMaxItemKB: 128,
      maxConcurrentFetches: 50,
      rustOgpCacheMax: 256,
      maxRequestsPerWindow: 300,
      circuitBreakerThreshold: 5,
      circuitBreakerDuration: 30,
      imageCacheTTLDays: 14,
      prefetchAhead: 50,
      prefetchBehind: 20,
    } satisfies PerformanceConfig,
  },
} as const

export type PresetKey = keyof typeof PRESETS

const DEFAULTS: PerformanceConfig = defaultsJson as PerformanceConfig

export const usePerformanceStore = defineStore('performance', () => {
  const overrides = ref<Partial<PerformanceConfig>>(
    getStorageJson<Partial<PerformanceConfig>>(STORAGE_KEYS.performance, {}),
  )
  const initialized = ref(false)

  /** Merged config: overrides on top of defaults. */
  const config = computed<PerformanceConfig>(() => ({
    ...DEFAULTS,
    ...overrides.value,
  }))

  /** Get a single value (reactive). */
  function get<K extends PerformanceKey>(key: K): PerformanceConfig[K] {
    return config.value[key]
  }

  /** Get the default value for a key. */
  function getDefault<K extends PerformanceKey>(key: K): PerformanceConfig[K] {
    return DEFAULTS[key]
  }

  function saveOverrides() {
    setStorageJson(STORAGE_KEYS.performance, overrides.value)
    if (initialized.value) {
      persistToFile().catch((e) =>
        console.warn('[performance] failed to persist to file:', e),
      )
    }
    syncToRust().catch((e) =>
      console.warn('[performance] failed to sync to Rust:', e),
    )
  }

  async function persistToFile(): Promise<void> {
    const content = JSON.stringify(overrides.value, null, 2)
    await writePerformance(content)
  }

  async function syncToRust(): Promise<void> {
    if (!isTauri) return
    const c = config.value
    await invoke('update_performance_config', {
      config: {
        memory_cache_max_total: c.memoryCacheMaxMB * 1024 * 1024,
        memory_cache_max_item: c.memoryCacheMaxItemKB * 1024,
        max_concurrent_fetches: c.maxConcurrentFetches,
        rust_ogp_cache_max: c.rustOgpCacheMax,
        max_requests_per_window: c.maxRequestsPerWindow,
        circuit_breaker_threshold: c.circuitBreakerThreshold,
        circuit_breaker_duration: c.circuitBreakerDuration,
        image_cache_ttl_days: c.imageCacheTTLDays,
      },
    })
  }

  async function initFileStorage(): Promise<void> {
    const content = await readPerformance()
    if (content) {
      try {
        const parsed = JSON.parse(content) as Partial<PerformanceConfig>
        overrides.value = parsed
        setStorageJson(STORAGE_KEYS.performance, parsed)
      } catch (e) {
        console.warn('[performance] failed to parse performance.json:', e)
      }
    }
    initialized.value = true
    if (!content && Object.keys(overrides.value).length > 0) {
      persistToFile().catch((e) =>
        console.warn('[performance] migration to file failed:', e),
      )
    }
    // Initial sync to Rust
    syncToRust().catch((e) =>
      console.warn('[performance] initial Rust sync failed:', e),
    )
  }

  function init(): void {
    if (isTauri) {
      initFileStorage().catch((e) =>
        console.warn('[performance] file storage init failed:', e),
      )
    } else {
      initialized.value = true
    }
  }

  function set<K extends PerformanceKey>(key: K, value: PerformanceConfig[K]) {
    const meta = FIELD_META[key]
    const clamped = Math.max(meta.min, Math.min(meta.max, value as number))
    if (clamped === DEFAULTS[key]) {
      delete overrides.value[key]
    } else {
      overrides.value[key] = clamped as PerformanceConfig[K]
    }
    saveOverrides()
  }

  function resetKey(key: PerformanceKey) {
    delete overrides.value[key]
    saveOverrides()
  }

  function resetAll() {
    overrides.value = {}
    saveOverrides()
  }

  function applyPreset(preset: PresetKey) {
    const p = PRESETS[preset]
    if (p.values == null) {
      overrides.value = {}
    } else {
      const partial: Partial<PerformanceConfig> = {}
      for (const [k, v] of Object.entries(p.values)) {
        const key = k as PerformanceKey
        if (v !== DEFAULTS[key]) {
          partial[key] = v as never
        }
      }
      overrides.value = partial
    }
    saveOverrides()
  }

  /** Detect which preset matches the current config (or 'custom'). */
  const activePreset = computed<PresetKey | 'custom'>(() => {
    const keys = Object.keys(overrides.value) as PerformanceKey[]
    if (keys.length === 0) return 'balanced'
    for (const [presetKey, preset] of Object.entries(PRESETS) as [
      PresetKey,
      (typeof PRESETS)[PresetKey],
    ][]) {
      if (preset.values == null) continue
      const presetOverrides: Partial<PerformanceConfig> = {}
      for (const [k, v] of Object.entries(preset.values)) {
        if (v !== DEFAULTS[k as PerformanceKey]) {
          presetOverrides[k as PerformanceKey] = v as never
        }
      }
      const presetKeys = Object.keys(presetOverrides) as PerformanceKey[]
      if (presetKeys.length !== keys.length) continue
      let match = true
      for (const pk of presetKeys) {
        if (overrides.value[pk] !== presetOverrides[pk]) {
          match = false
          break
        }
      }
      if (match) return presetKey
    }
    return 'custom'
  })

  function isCustomized(key: PerformanceKey): boolean {
    return key in overrides.value
  }

  return {
    overrides,
    config,
    activePreset,
    init,
    get,
    getDefault,
    set,
    resetKey,
    resetAll,
    applyPreset,
    isCustomized,
  }
})
