import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  detectQuality,
  detectQualitySync,
  type QualityPreset,
} from '@/composables/useAdaptiveQuality'
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
  prefetchTrackedMax: number
  lazyLoadMargin: number
  nearViewportBuffer: number
  // Image / OGP
  ogpGalleryMax: number
  embedCacheMax: number
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
  prefetchTrackedMax: {
    min: 100,
    max: 2000,
    step: 100,
    unit: '件',
    category: 'realtime',
    label: 'プリフェッチ追跡上限',
    description: 'プリフェッチ済みURLの記憶数。超過すると古い順に破棄',
  },
  lazyLoadMargin: {
    min: 0,
    max: 500,
    step: 50,
    unit: 'px',
    category: 'realtime',
    label: '遅延読み込みマージン',
    description:
      'OGPプレビューや埋め込みノートの読み込みを開始するviewportからの距離',
  },
  nearViewportBuffer: {
    min: 1,
    max: 10,
    step: 1,
    unit: '件',
    category: 'realtime',
    label: 'Viewport近傍バッファ',
    description: 'viewport端から画像をeager読み込みする余裕アイテム数',
  },
  ogpGalleryMax: {
    min: 0,
    max: 8,
    step: 1,
    unit: '枚',
    category: 'cache',
    label: 'OGPギャラリー上限',
    description: 'OGPプレビューのギャラリー画像の最大表示枚数',
  },
  embedCacheMax: {
    min: 16,
    max: 256,
    step: 16,
    unit: '件',
    category: 'cache',
    label: '埋め込みノートキャッシュ',
    description: '埋め込みノートのLRUキャッシュ上限',
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
      emojiCachePerHost: 2000,
      emojiListHosts: 2,
      emojiPersistPerHost: 200,
      noteStoreMax: 800,
      noteListMax: 150,
      maxNotifications: 100,
      mfmCacheMax: 128,
      imageProxyCacheMax: 128,
      ogpCacheMax: 64,
      noteCaptureMax: 20,
      overscan: 4,
      memoryCacheMaxMB: 2,
      memoryCacheMaxItemKB: 32,
      maxConcurrentFetches: 15,
      rustOgpCacheMax: 32,
      maxRequestsPerWindow: 100,
      circuitBreakerThreshold: 3,
      circuitBreakerDuration: 90,
      imageCacheTTLDays: 3,
      prefetchAhead: 15,
      prefetchBehind: 5,
      prefetchTrackedMax: 200,
      lazyLoadMargin: 100,
      nearViewportBuffer: 2,
      ogpGalleryMax: 2,
      embedCacheMax: 32,
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
      emojiCachePerHost: 7000,
      emojiListHosts: 6,
      emojiPersistPerHost: 700,
      noteStoreMax: 3000,
      noteListMax: 300,
      maxNotifications: 500,
      mfmCacheMax: 512,
      imageProxyCacheMax: 512,
      ogpCacheMax: 256,
      noteCaptureMax: 100,
      overscan: 10,
      memoryCacheMaxMB: 8,
      memoryCacheMaxItemKB: 128,
      maxConcurrentFetches: 40,
      rustOgpCacheMax: 128,
      maxRequestsPerWindow: 300,
      circuitBreakerThreshold: 5,
      circuitBreakerDuration: 30,
      imageCacheTTLDays: 14,
      prefetchAhead: 40,
      prefetchBehind: 15,
      prefetchTrackedMax: 1000,
      lazyLoadMargin: 300,
      nearViewportBuffer: 6,
      ogpGalleryMax: 6,
      embedCacheMax: 128,
    } satisfies PerformanceConfig,
  },
} as const

export type PresetKey = keyof typeof PRESETS

const DEFAULTS: PerformanceConfig = defaultsJson as PerformanceConfig

const FIXED_OVERHEAD_MB = 6 // tokio runtime + HTTP pools + Rust structures

/** Estimate memory usage (MB) for a given config. */
export function estimateMemoryMB(c: PerformanceConfig): number {
  const imageCacheMB = c.memoryCacheMaxMB
  const noteStoreMB = (c.noteStoreMax * 4) / 1024 // ~4KB per note (nested user/reactions + V8 overhead)
  const emojiMB = (c.emojiCachePerHost * c.emojiListHosts * 0.3) / 1024 // ~0.3KB (shortcode + URL + ServerEmoji)
  const notificationMB = (c.maxNotifications * 4) / 1024 // ~4KB (note object + notification metadata)
  // Parse caches differ in entry size
  const mfmCacheMB = (c.mfmCacheMax * 2) / 1024 // ~2KB per MFM AST
  const proxyCacheMB = (c.imageProxyCacheMax * 0.2) / 1024 // ~0.2KB per URL string
  const ogpCacheMB = (c.ogpCacheMax * 1.5) / 1024 // ~1.5KB (title + description + image URL)
  const rustOgpMB = (c.rustOgpCacheMax * 5) / 1024
  const embedCacheMB = (c.embedCacheMax * 4) / 1024 // ~4KB per embedded note
  const prefetchTrackMB = (c.prefetchTrackedMax * 0.1) / 1024 // ~0.1KB per URL in Set
  return Math.round(
    FIXED_OVERHEAD_MB +
      imageCacheMB +
      noteStoreMB +
      emojiMB +
      notificationMB +
      mfmCacheMB +
      proxyCacheMB +
      ogpCacheMB +
      rustOgpMB +
      embedCacheMB +
      prefetchTrackMB,
  )
}

/**
 * Estimate hourly network usage (MB/hour) for moderate use.
 *
 * Model assumptions (3 active columns, moderate scrolling):
 * - ~150 unique notes viewed per hour (base)
 * - Prefetch loads images slightly ahead; most would be viewed on scroll,
 *   only ~30% of prefetch range represents truly extra load
 * - ~50KB per note for images (avatar + emoji + occasional thumbnail, after proxy resize)
 * - Higher concurrency / rate limits → more requests complete → more actual bytes
 * - ~20% of notes contain URLs that trigger OGP fetch (~10KB each)
 * - ~3KB of API/WebSocket traffic per note (JSON payload)
 */
export function estimateNetworkMBPerHour(c: PerformanceConfig): number {
  const BASE_NOTES = 150
  const AVG_IMAGE_KB = 50
  // Only ~30% of prefetch range is "extra" (rest would be viewed on scroll)
  const prefetchExtra = (c.prefetchAhead + c.prefetchBehind) * 0.3
  // Higher concurrency and rate limits allow more requests to complete,
  // increasing effective throughput (normalized to balanced defaults)
  const throughputFactor = Math.sqrt(
    (c.maxConcurrentFetches / 30) * (c.maxRequestsPerWindow / 200),
  )
  const imageTraffic =
    ((BASE_NOTES + prefetchExtra) * AVG_IMAGE_KB * throughputFactor) / 1024
  // ~20% of notes contain URLs triggering OGP fetch
  const ogpTraffic = (BASE_NOTES * 0.2 * 10) / 1024
  // API/WebSocket: note JSON + notifications + streaming
  const apiTraffic = (BASE_NOTES * 3) / 1024
  return Math.round(imageTraffic + ogpTraffic + apiTraffic)
}

export const usePerformanceStore = defineStore('performance', () => {
  const overrides = ref<Partial<PerformanceConfig>>(
    getStorageJson<Partial<PerformanceConfig>>(STORAGE_KEYS.performance, {}),
  )
  const initialized = ref(false)
  const recommendedPreset = ref<QualityPreset | null>(null)

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
    // Adaptive quality: sync detection first, then precise measurement when idle
    recommendedPreset.value = detectQualitySync()
    const runPrecise = () => {
      detectQuality()
        .then((result) => {
          recommendedPreset.value = result
        })
        .catch(() => {
          // Keep sync result as fallback
        })
    }
    if (typeof window !== 'undefined' && window.requestIdleCallback) {
      window.requestIdleCallback(runPrecise, { timeout: 5000 })
    } else {
      setTimeout(runPrecise, 3000)
    }

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

  /** Estimated memory usage (MB) for current config. */
  const estimatedMemoryMB = computed(() => estimateMemoryMB(config.value))
  /** Estimated network usage (MB/hour) for current config. */
  const estimatedNetworkMBPerHour = computed(() =>
    estimateNetworkMBPerHour(config.value),
  )

  return {
    overrides,
    config,
    activePreset,
    recommendedPreset,
    estimatedMemoryMB,
    estimatedNetworkMBPerHour,
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
