import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  detectQuality,
  detectQualitySync,
  type QualityPreset,
} from '@/composables/useAdaptiveQuality'
import defaultsJson from '@/defaults/performance.json'
import { frameEngine } from '@/engine/frameEngine'
import {
  frameTelemetry,
  type QualityLevel,
} from '@/engine/telemetry/frameTelemetry'
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
  // CSS rendering
  cssBlurLevel: number
  cssAnimationScale: number
  cssShadowLevel: number
  // Rust: backend
  memoryCacheMaxMB: number
  memoryCacheMaxItemKB: number
  maxConcurrentFetches: number
  rustOgpCacheMax: number
  maxRequestsPerWindow: number
  circuitBreakerThreshold: number
  circuitBreakerDuration: number
  imageCacheTTLDays: number
  // Polling
  notificationPollInterval: number
  chatPollInterval: number
  // Realtime (continued)
  columnUnloadDelay: number
  snapshotMaxNotes: number
  snapshotTTL: number
  // Telemetry
  jankDowngradeThreshold: number
  stableUpgradeSeconds: number
  noteAnimationDuration: number
  frameHistorySize: number
  // Cache (continued)
  soundCacheMax: number
  cachedTimelineLimit: number
  // Interaction
  pullFireThreshold: number
  swipeThreshold: number
  flingVelocity: number
  wheelCooldown: number
  scrollHideThreshold: number
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
  cssBlurLevel: {
    min: 0,
    max: 2,
    step: 1,
    unit: '',
    category: 'css',
    label: 'ブラー強度',
    description:
      'backdrop-filterブラーの強度。0=無効、1=軽量(1–2px)、2=フル(4px)。最もGPU負荷が高い',
  },
  cssAnimationScale: {
    min: 0,
    max: 100,
    step: 25,
    unit: '%',
    category: 'css',
    label: 'アニメーション速度',
    description:
      'トランジション・アニメーションの速度スケール。0%で即時描画、100%で通常速度',
  },
  cssShadowLevel: {
    min: 0,
    max: 2,
    step: 1,
    unit: '',
    category: 'css',
    label: 'シャドウ強度',
    description: 'box-shadowの描画レベル。0=無効、1=軽量、2=フル(Misskey準拠)',
  },
  notificationPollInterval: {
    min: 30,
    max: 600,
    step: 30,
    unit: '秒',
    category: 'polling',
    label: '通知ポーリング間隔',
    description:
      '通知未読数の確認間隔。短いほどリアルタイム、長いほどバッテリー節約',
  },
  chatPollInterval: {
    min: 30,
    max: 600,
    step: 30,
    unit: '秒',
    category: 'polling',
    label: 'チャットポーリング間隔',
    description: 'チャット未読の確認間隔',
  },
  columnUnloadDelay: {
    min: 1000,
    max: 30000,
    step: 1000,
    unit: 'ms',
    category: 'realtime',
    label: 'カラムアンロード遅延',
    description:
      '画面外カラムをアンマウントするまでの待機時間。短いほどメモリ節約',
  },
  snapshotMaxNotes: {
    min: 10,
    max: 100,
    step: 10,
    unit: '件',
    category: 'realtime',
    label: 'スナップショット保存数',
    description: 'カラムスナップショットに保存するノート数。多いほど復帰が完全',
  },
  snapshotTTL: {
    min: 1,
    max: 30,
    step: 1,
    unit: '分',
    category: 'realtime',
    label: 'スナップショット有効期限',
    description: 'カラムスナップショットの保持期間。期限切れで再フェッチ',
  },
  jankDowngradeThreshold: {
    min: 1,
    max: 15,
    step: 1,
    unit: '回/秒',
    category: 'telemetry',
    label: 'ジャンク検出感度',
    description:
      'この回数/秒を超えるジャンクで自動品質ダウングレード。低いほど敏感',
  },
  stableUpgradeSeconds: {
    min: 5,
    max: 30,
    step: 5,
    unit: '秒',
    category: 'telemetry',
    label: 'アップグレード待機',
    description: '安定がこの秒数続くと自動品質アップグレードを試行',
  },
  noteAnimationDuration: {
    min: 0,
    max: 800,
    step: 50,
    unit: 'ms',
    category: 'telemetry',
    label: 'ノート出現アニメーション',
    description: '新着ノートのスライドインアニメーション時間。0で即時表示',
  },
  frameHistorySize: {
    min: 30,
    max: 500,
    step: 10,
    unit: 'フレーム',
    category: 'telemetry',
    label: 'P95履歴サイズ',
    description:
      'P95フレーム時間計算用のリングバッファサイズ。大きいほど安定するが反応が遅い',
  },
  soundCacheMax: {
    min: 2,
    max: 32,
    step: 2,
    unit: '件',
    category: 'cache',
    label: '通知音キャッシュ',
    description: '通知音のAudioBufferキャッシュ数。多サーバー利用時は増やす',
  },
  cachedTimelineLimit: {
    min: 10,
    max: 200,
    step: 10,
    unit: '件',
    category: 'cache',
    label: 'タイムラインキャッシュ読み込み',
    description: 'カラム復帰時にDBキャッシュから読み込むノート件数',
  },
  pullFireThreshold: {
    min: 80,
    max: 400,
    step: 20,
    unit: 'px',
    category: 'interaction',
    label: 'プルリフレッシュ距離',
    description: 'プルトゥリフレッシュが発火するまでの引っ張り距離',
  },
  swipeThreshold: {
    min: 20,
    max: 120,
    step: 10,
    unit: 'px',
    category: 'interaction',
    label: 'スワイプ切り替え距離',
    description: 'タブ切り替えに必要な最小スワイプ距離',
  },
  flingVelocity: {
    min: 0.1,
    max: 1.0,
    step: 0.1,
    unit: 'px/ms',
    category: 'interaction',
    label: 'フリック速度',
    description: 'この速度以上のフリックで即座にタブ切り替え',
  },
  wheelCooldown: {
    min: 100,
    max: 1000,
    step: 50,
    unit: 'ms',
    category: 'interaction',
    label: 'ホイールクールダウン',
    description: 'マウスホイールによるタブ切り替え後の再発火防止時間',
  },
  scrollHideThreshold: {
    min: 10,
    max: 100,
    step: 10,
    unit: 'px',
    category: 'interaction',
    label: 'ナビバー非表示感度',
    description: 'スクロールでナビバーを非表示にする累積距離。小さいほど敏感',
  },
}

export const CATEGORY_LABELS: Record<string, { label: string; icon: string }> =
  {
    emoji: { label: '絵文字キャッシュ', icon: 'ti-mood-smile' },
    note: { label: 'ノート', icon: 'ti-note' },
    cache: { label: 'パースキャッシュ', icon: 'ti-database' },
    realtime: { label: 'リアルタイム', icon: 'ti-bolt' },
    backend: { label: 'バックエンド', icon: 'ti-server' },
    css: { label: 'CSS描画', icon: 'ti-palette' },
    polling: { label: 'ポーリング', icon: 'ti-refresh' },
    telemetry: { label: 'テレメトリ', icon: 'ti-chart-line' },
    interaction: { label: 'インタラクション', icon: 'ti-hand-finger' },
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
      cssBlurLevel: 0,
      cssAnimationScale: 50,
      cssShadowLevel: 1,
      notificationPollInterval: 300,
      chatPollInterval: 300,
      columnUnloadDelay: 2000,
      snapshotMaxNotes: 20,
      snapshotTTL: 5,
      jankDowngradeThreshold: 3,
      stableUpgradeSeconds: 15,
      noteAnimationDuration: 200,
      frameHistorySize: 50,
      soundCacheMax: 4,
      cachedTimelineLimit: 20,
      pullFireThreshold: 200,
      swipeThreshold: 50,
      flingVelocity: 0.4,
      wheelCooldown: 300,
      scrollHideThreshold: 30,
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
      cssBlurLevel: 2,
      cssAnimationScale: 100,
      cssShadowLevel: 2,
      notificationPollInterval: 60,
      chatPollInterval: 60,
      columnUnloadDelay: 15000,
      snapshotMaxNotes: 80,
      snapshotTTL: 20,
      jankDowngradeThreshold: 8,
      stableUpgradeSeconds: 5,
      noteAnimationDuration: 500,
      frameHistorySize: 200,
      soundCacheMax: 16,
      cachedTimelineLimit: 80,
      pullFireThreshold: 200,
      swipeThreshold: 50,
      flingVelocity: 0.4,
      wheelCooldown: 300,
      scrollHideThreshold: 30,
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
  const noteCaptureMB = (c.noteCaptureMax * 0.5) / 1024 // ~0.5KB per WebSocket subscription
  // GPU texture memory for backdrop-filter compositing layers
  // Each blur surface creates a ~400×800 RGBA texture ≈ 1.2MB
  // After cleanup: only 3 permanent surfaces (navbar, window header, acrylic)
  const blurGpuMB = c.cssBlurLevel > 0 ? c.cssBlurLevel * 0.8 : 0
  // Column snapshots: ~5 columns × snapshotMaxNotes × 4KB per note
  const snapshotMB = (5 * c.snapshotMaxNotes * 4) / 1024
  // Sound cache: ~50KB per AudioBuffer (short notification sounds)
  const soundCacheMB = (c.soundCacheMax * 50) / 1024
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
      prefetchTrackMB +
      noteCaptureMB +
      blurGpuMB +
      snapshotMB +
      soundCacheMB,
  )
}

export interface RenderCost {
  /** 0–100 relative rendering weight */
  score: number
  /** Human-readable label */
  label: string
}

/**
 * Estimate CSS rendering cost as a 0–100 relative score.
 *
 * Factors (approximate GPU frame-time contribution):
 * - backdrop-filter blur: heaviest — each composited layer costs 1–5ms
 * - box-shadow: moderate — GPU rasterisation per shadowed element
 * - Animation/transition: light (compositor-only) but many concurrent ones add up
 * - DOM element count (overscan + noteListMax): more layers to composite
 */
export function estimateRenderCost(c: PerformanceConfig): RenderCost {
  // Blur: 0→0, 1→15, 2→40 (non-linear — blur radius cost grows super-linearly)
  const blurScore = c.cssBlurLevel === 0 ? 0 : c.cssBlurLevel === 1 ? 15 : 40
  // Shadow: 0→0, 1→5, 2→10
  const shadowScore = c.cssShadowLevel * 5
  // Animations: 0→0, 50→4, 100→8
  const animScore = (c.cssAnimationScale / 100) * 8
  // Overscan: each extra item = extra composite layer (clamped contribution)
  const overscanScore = Math.min(Math.max(c.overscan - 2, 0) * 1.5, 15)
  // DOM size: more rendered notes = heavier composite
  const domScore = Math.min((c.noteListMax - 50) / 25, 20)

  const raw = Math.round(
    blurScore + shadowScore + animScore + overscanScore + domScore,
  )
  const score = Math.max(0, Math.min(100, raw))

  let label: string
  if (score <= 25) label = '軽い'
  else if (score <= 50) label = '標準'
  else if (score <= 75) label = 'やや重い'
  else label = '重い'

  return { score, label }
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
  // Polling overhead: ~2KB per poll response
  const pollRequestsPerHour =
    3600 / c.notificationPollInterval + 3600 / c.chatPollInterval
  const pollTraffic = (pollRequestsPerHour * 2) / 1024
  return Math.round(imageTraffic + ogpTraffic + apiTraffic + pollTraffic)
}

/** Base durations (seconds) matching global.css :root values. */
const CSS_BASE_DURATIONS: Record<string, number> = {
  '--nd-duration-fast': 0.15,
  '--nd-duration-base': 0.2,
  '--nd-duration-slow': 0.28,
  '--nd-duration-slower': 0.38,
  '--nd-duration-tl-enter': 0.5,
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

  /** Apply CSS-related config values to :root custom properties. */
  function syncCssProperties(): void {
    if (typeof document === 'undefined') return
    const s = document.documentElement.style
    const c = config.value

    // --- Blur ---
    switch (c.cssBlurLevel) {
      case 0:
        s.setProperty('--nd-blur', '0px')
        s.setProperty('--nd-blur-panel', '0px')
        s.setProperty('--nd-blur-content', '0px')
        s.setProperty('--nd-vibrancy', 'none')
        s.setProperty('--nd-vibrancy-panel', 'none')
        s.setProperty('--nd-vibrancy-content', 'none')
        break
      case 2:
        s.setProperty('--nd-blur', '4px')
        s.setProperty('--nd-blur-panel', '2px')
        s.setProperty('--nd-blur-content', '2px')
        s.setProperty('--nd-vibrancy', 'blur(4px)')
        s.setProperty('--nd-vibrancy-panel', 'blur(2px)')
        s.setProperty('--nd-vibrancy-content', 'blur(2px)')
        break
      default: // 1 = global.css defaults
        for (const p of [
          '--nd-blur',
          '--nd-blur-panel',
          '--nd-blur-content',
          '--nd-vibrancy',
          '--nd-vibrancy-panel',
          '--nd-vibrancy-content',
        ])
          s.removeProperty(p)
    }

    // --- Shadow ---
    switch (c.cssShadowLevel) {
      case 0:
        s.setProperty('--nd-shadow-s', 'none')
        s.setProperty('--nd-shadow-m', 'none')
        s.setProperty('--nd-shadow-l', 'none')
        break
      case 1:
        s.setProperty('--nd-shadow-s', '0 1px 4px var(--nd-shadow)')
        s.setProperty('--nd-shadow-m', '0 2px 12px var(--nd-shadow)')
        s.setProperty('--nd-shadow-l', '0 4px 16px var(--nd-shadow)')
        break
      default: // 2 = global.css defaults
        for (const p of ['--nd-shadow-s', '--nd-shadow-m', '--nd-shadow-l'])
          s.removeProperty(p)
    }

    // --- Animation duration scale ---
    const scale = c.cssAnimationScale / 100
    if (scale === 1) {
      for (const p of Object.keys(CSS_BASE_DURATIONS)) s.removeProperty(p)
    } else if (scale === 0) {
      for (const p of Object.keys(CSS_BASE_DURATIONS))
        s.setProperty(p, '0.01ms')
    } else {
      for (const [p, base] of Object.entries(CSS_BASE_DURATIONS))
        s.setProperty(p, `${(base * scale).toFixed(3)}s`)
    }
  }

  function saveOverrides() {
    setStorageJson(STORAGE_KEYS.performance, overrides.value)
    syncCssProperties()
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

    // Apply CSS overrides to :root on startup
    syncCssProperties()

    // --- Frame Engine + Telemetry ---
    frameEngine.start()

    // Map preset to telemetry quality level
    const presetToQuality = (p: QualityPreset): QualityLevel => p

    frameTelemetry.start(
      presetToQuality(recommendedPreset.value ?? 'balanced'),
      (quality) => {
        // Auto quality adjustment — only change CSS rendering properties
        // (blur, shadow, animation). Never touch cache sizes or note limits,
        // as those are unrelated to frame jank.
        applyCssQuality(quality)
      },
      {
        jankDowngradeThreshold: config.value.jankDowngradeThreshold,
        stableUpgradeSeconds: config.value.stableUpgradeSeconds,
        frameHistorySize: config.value.frameHistorySize,
      },
    )
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

  /** CSS rendering property presets for auto-quality adjustment.
   *  Only blur/shadow/animation — never cache sizes or note limits. */
  const CSS_QUALITY_PRESETS: Record<
    QualityLevel,
    Pick<
      PerformanceConfig,
      'cssBlurLevel' | 'cssAnimationScale' | 'cssShadowLevel'
    >
  > = {
    low: { cssBlurLevel: 0, cssAnimationScale: 50, cssShadowLevel: 1 },
    balanced: {
      cssBlurLevel: DEFAULTS.cssBlurLevel,
      cssAnimationScale: DEFAULTS.cssAnimationScale,
      cssShadowLevel: DEFAULTS.cssShadowLevel,
    },
    high: { cssBlurLevel: 2, cssAnimationScale: 100, cssShadowLevel: 2 },
  }

  /** Apply only CSS rendering properties for auto-quality adjustment. */
  function applyCssQuality(quality: QualityLevel): void {
    const css = CSS_QUALITY_PRESETS[quality]
    for (const [k, v] of Object.entries(css)) {
      const key = k as PerformanceKey
      if (v === DEFAULTS[key]) {
        delete overrides.value[key]
      } else {
        overrides.value[key] = v as never
      }
    }
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
  /** Estimated CSS rendering cost for current config. */
  const estimatedRenderCost = computed(() => estimateRenderCost(config.value))

  return {
    overrides,
    config,
    activePreset,
    recommendedPreset,
    estimatedMemoryMB,
    estimatedNetworkMBPerHour,
    estimatedRenderCost,
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
