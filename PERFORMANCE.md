# PERFORMANCE — パフォーマンス改善ロードマップ

Bluesky (AT Protocol)、Nostr、旧 Twitter OSS 文化の知見に基づく改善候補。
既存の最適化は [ARCHITECTURE.md](ARCHITECTURE.md) を参照。

---

## 定量評価サマリー

各項目をコードベースの実測値に基づいて評価した結論。

### 即実装 (計測不要、確実に効果あり)

| 項目 | 工数 | 見込み効果 | 根拠 |
|------|------|-----------|------|
| **P2-A** 初回 connect 並行化 | 数時間 | 200-1000ms 体感改善 | HTTP RTT 分の待ちを排除。`onResume()` パターンのコピー |
| **P1-B** バックプレッシャー通知 | 数時間 | UX 安全弁 | toast 1 行追加。パフォーマンスではなくバグ誤認防止 |
| **P2.5-B** 絵文字並列プリフェッチ | 1-2 時間 | 200-600ms 初回改善 | `Promise.allSettled` ラップのみ |

### プロファイリング後に判断

| 項目 | 工数 | 見込み効果 | 計測方法 |
|------|------|-----------|---------|
| **P3-A** MFM オフロード | 1-2 週間 | 10-100ms (要計測) | DevTools Performance → `parseMfm` の Self Time |
| **P1-A** サブスクリプション停止 | 1-2 週間 | 5-15% CPU (要計測) | DevTools → hidden column の `stream-event` listener CPU |
| ~~P2.5-A マルチサーバー並行~~ | — | **不要（検証済み）** | Vue async mount で 11ms 以内に全カラム並行開始を確認 |

### 見送り (工数に見合わない)

| 項目 | 理由 |
|------|------|
| P4-B WebSocket 集約 | 同一サーバー複数アカウントは少数派。1 接続 ~10KB |
| P4-C URI デデュプ | 重複は推定 5-10%。75-750KB 節約。`uri` 必須化が前提 |
| P4-A オフラインキュー | 楽観的更新は実装済み。オフライン投稿は低頻度 |
| P1-C CSS 監査 | 問題未報告。frameTelemetry で検出してから |
| P2-B アダプティブプリフェッチ | prefetchAhead=30 で十分。ユーザー報告なし |
| P4-D/P3-B ヘルス + Scoring | 信頼性改善でありパフォーマンスではない |
| P4-E 機能差分 | 正確性改善でありパフォーマンスではない |
| P2.5-C ノート詳細並列 | 表示頻度が低い。notecli API 変更必要 |

---

## 目次

- [現状の最適化サマリー](#現状の最適化サマリー)
- [優先度マトリクス](#優先度マトリクス)
- [Phase 1: 即実装](#phase-1-即実装数時間)
  - [P2-A: 初回 connect 並行化](#p2-a-stale-while-revalidate-キャッシュ即表示)
  - [P1-B: ストリーミング バックプレッシャー通知](#p1-b-ストリーミング-バックプレッシャー通知)
  - [P2.5-B: 絵文字メタデータの並列プリフェッチ](#p25-b-絵文字メタデータの並列プリフェッチ)
- [Phase 2: プロファイリング後に判断](#phase-2-プロファイリング後に判断)
  - [P3-A: MFM パースの Rust オフロード](#p3-a-mfm-パースの-rust-オフロード)
  - [P1-A: 非表示カラムのサブスクリプション停止](#p1-a-非表示カラムのサブスクリプション停止)
  - [P2.5-A: マルチサーバー同時タイムライン取得](#p25-a-マルチサーバー同時タイムライン取得)
- [Phase 3: ActivityPub/マルチサーバー固有 (問題報告待ち)](#phase-4-activitypubマルチサーバー固有の最適化)
- [補足: 見送り・低優先度の候補](#補足-見送り低優先度の候補)
- [知見の出典](#知見の出典)

---

## 現状の最適化サマリー

NoteDeck は既にエンタープライズグレードの最適化を実装済み。以下は完了項目：

| 領域 | 実装 | 主要ファイル |
|------|------|-------------|
| 仮想スクロール | TanStack Vue Virtual + EMA 動的高さ推定 | `src/components/common/NoteScroller.vue` |
| Frame scheduling | 5 フェーズ Frame Engine (input/animate/read/write/idle) | `src/engine/frameEngine.ts` |
| 反応性制御 | `shallowRef` + `scheduleTrigger()` バッチ更新 | `src/stores/notes.ts` |
| ストリーミングバッチ | RAF バッファリング + emergency cap | `src/composables/useStreamingBatch.ts` |
| 画像最適化 | プリフェッチ + OGP LRU (128) + IntersectionObserver | `src/composables/useImagePrefetch.ts` |
| コード分割 | 99 `defineAsyncComponent` + `manualChunks` | `vite.config.ts` |
| Multi-tier cache | メモリ LRU → SQLite → ネットワーク | `src-tauri/src/image_cache.rs` |
| OGP inflight dedup | 同時リクエスト重複排除 | `src-tauri/src/ogp/mod.rs` |
| 適応的品質 | CPU/メモリからの自動判定 (low/balanced/high) | `src/composables/useAdaptiveQuality.ts` |
| WebSocket 共有 | accountId 毎 1 接続、subscriptionId 管理 | `src/adapters/misskey/streaming.ts` |
| 2 段階初期化 | Phase 1 < 50ms → Phase 2 並行 3 スレッド | `src-tauri/src/lib.rs` |
| カラム遅延表示 | IntersectionObserver + snapshot/restore | `src/composables/useColumnVisibility.ts` |
| フォント最適化 | Tabler Icons 動的サブセット (woff2) | Vite plugin |
| 楽観的リアクション | 即座に UI 更新 + API 失敗時ロールバック | `src/utils/toggleReaction.ts` |
| リジューム並行化 | `onResume()` でキャッシュ + API を `Promise.all()` | `src/composables/useNoteColumn.ts` |
| 初回 connect 並行化 | キャッシュ即表示 + API バックグラウンド fetch | `src/composables/useNoteColumn.ts` |
| overflow 通知 | emergency cap 到達時に warning toast | `src/composables/useStreamingBatch.ts` |
| 非表示カラム sub 停止 | 画面外カラムの WebSocket 購読解除 + 再表示時 sinceId 差分 | `src/composables/useNoteColumn.ts` |
| MFM Worker プリフェッチ | Web Worker でバッチパース → メインスレッドキャッシュ注入 | `src/composables/useMfmPrefetch.ts` |
| ノート重複排除 | `mergeSortedNotes` に ID dedup 追加 | `src/utils/sortNotes.ts` |
| Emoji grid 仮想化 | `useGridVirtualizer` で行ベース仮想スクロール | `src/composables/useGridVirtualizer.ts` |
| Vapor Mode 準備 | h()/JSX なし、Transition/Teleport を composable 置換済み | `src/composables/useVaporTransition.ts` |

### Rust 側の並列処理状況

| 領域 | 状況 | 手法 |
|------|------|------|
| OGP プリフェッチ | 並列 | `buffer_unordered(20)` |
| 画像キャッシュ取得 | 並列 | `Semaphore(30)` で同時制御 |
| 起動時初期化 | 並列 | DB / Client / HTTP を 3 スレッドで同時起動 |
| WebSocket 接続 | 並行 | アカウントごとに独立管理 |
| API リクエスト | **直列** | 個々のコマンドは直列実行 |
| CPU 並列 (rayon 等) | **未使用** | — |

ランタイム設定は `perf_config.rs` (`PerformanceConfig`) で動的変更可能:
- `max_concurrent_fetches: 30` — Semaphore 上限
- `rust_ogp_cache_max: 64` — OGP キャッシュエントリ数
- `circuit_breaker_threshold: 5` — 連続失敗で遮断
- `memory_cache_max_total: 4MB` — メモリキャッシュ上限

---

## 優先度マトリクス

```
                 実装容易（低難易度）              実装困難（高難易度）
高インパクト  │ P1-A サブスクリプション停止     │ P3-A MFM Rustオフロード
              │ P1-B バックプレッシャー通知     │
              │ P2-A 初回connect並行化          │
              │ P2.5-A マルチサーバー同時取得   │
              │ P4-B WebSocket接続集約          │
──────────────┼────────────────────────────────┤
中インパクト  │ P2-B アダプティブプリフェッチ   │ P3-B+P4-D ヘルス+Scoring 統合
              │ P1-C Compositor-only CSS       │ P4-C 連合URIデデュプ (※uri必須化前提)
              │ P2.5-B 絵文字並列プリフェッチ  │ P2.5-C ノート詳細並列取得
              │ P4-E 機能差分の動的適応         │ P4-A オフラインキュー (※楽観的更新は実装済)
```

**統合候補**:
- P1-A (sub停止) + P4-B (接続集約): 同一基盤で設計すべき
- P2-A (SWR) + P2.5-A (マルチサーバー同時取得): 組み合わせると効果倍増
- P3-B (Relay Scoring) + P4-D (ヘルスモニタリング): 同じレイテンシ計測基盤

**見送りに移動**:
- P2-C (サーバーサイドフィルタ): Misskey API パラメータは既に渡されている可能性が高く、追加インパクトが小さい
- P4-F (分散キャッシュ): 実装コストが巨大。長期構想として記録のみ

---

## Phase 1: 即実装（数時間、計測不要）

### P2-A: 初回 connect 並行化 → 下記参照
### P1-B: バックプレッシャー通知 → 下記参照
### P2.5-B: 絵文字並列プリフェッチ → 下記参照

---

## Phase 2: プロファイリング後に判断

以下は効果が不確定。**DevTools で計測し、閾値を超えた場合のみ実装**する。

### P1-A: 非表示カラムのサブスクリプション停止

**出典**: Nostr NIP-01 REQ/CLOSE モデル（Damus, Gossip 等）

#### 背景

Nostr クライアントでは、不要になったサブスクリプションを即座に CLOSE する
ことでリレーの負荷とクライアントのイベント処理負荷を最小化する。
Damus は画面外フィードのサブスクリプションを積極的に CLOSE する。

#### 現状の問題

`useColumnVisibility` で Vue 側の `setPaused(true)` はするが、
Rust 側の WebSocket 購読は継続。10 カラム中 2-3 しか見えていなくても、
残り 7-8 カラム分の JSON parse → 正規化 → event emit が走り続ける。

#### 改善案

非表示カラムの `stream_unsubscribe` を呼び、
再表示時に `sinceId` 付きで差分フェッチ + 再サブスクライブ。

```
カラム非表示 → stream_unsubscribe(subscriptionId)
                                  ↓
カラム再表示 → api_get_timeline(sinceId: lastNoteId)
             → stream_subscribe(timeline, handler)
             → mergeUpdate(差分ノート)
```

#### 期待効果

> **注**: 当初「70-80% 削減」と見積もったが過大評価。
> `setPaused(true)` で JS 側の enqueue は既に停止しており、
> 残るコストは Rust 側の JSON parse → Tauri emit → JS listener dispatch
> (accountId チェックで早期 return) のみ。
>
> - 通常サーバー (1-5 events/sec/channel): CPU 影響は微小
> - 大規模サーバーのグローバル TL (10-50 events/sec): **5-15% CPU 削減**
>
> **実装前に DevTools Performance タブで hidden column の
> `stream-event` listener の CPU 消費を計測すること。**

#### 対象ファイル

- `src/composables/useColumnVisibility.ts` — mounted 変更時に sub/unsub トリガー
- `src/composables/useNoteColumn.ts` — 再接続フローに sinceId 差分取得追加

---

### P1-B: ストリーミング バックプレッシャー通知

**出典**: Twitter Finagle のバックプレッシャー機構

#### 背景

Twitter 内部では、ストリーミング消費側が処理しきれない場合に
明示的にバックプレッシャーをかけ、メッセージを一時的にドロップして
「再接続時に差分取得」のフローに切り替えていた。

#### 現状の問題

`useStreamingBatch.ts` の emergency cap（`rafBuffer.length >= MAX_NOTES * 2`）で
サイレントドロップ。Rust 側にはバックプレッシャー機構なし。
misskey.io 等の大規模サーバーのグローバル TL で問題になりうる。

#### 改善案

バッファ上限到達時に toast 通知 + サブスクリプション一時停止。
「新着が多すぎます。タップで更新」UI を表示。

```typescript
// useStreamingBatch.ts のemergency capに追加
if (rafBuffer.length >= MAX_NOTES * 2) {
  toastStore.showToast({
    message: i18n.t('streaming.overflowWarning'),
    action: { label: i18n.t('common.refresh'), handler: reconnect },
  })
  streamAdapter.pause(subscriptionId)
}
```

#### 対象ファイル

- `src/composables/useStreamingBatch.ts` — emergency cap に通知ロジック追加

---

### P2-A: Stale-While-Revalidate キャッシュ即表示

**出典**: Nostr Local Relay パターン（Citrine, Gossip） + Bluesky AppView

#### 背景

Nostr の Gossip (Rust 製) は LMDB をローカルストアとして使い、
オフライン時はローカルから読み出す。オンラインでもまずローカルを表示し、
リレーから差分を非同期マージする。

Bluesky の AppView もデータの加工・集約を担い、
クライアントは表示に専念する設計思想。

#### 現状の問題

**初回 `connect()` のみ逐次フロー**: キャッシュ読み込み(`await loadFilteredCache`)
完了後に API fetch(`await fetchAndDedup`) が走る。
API 応答が遅いとカラムが空のまま待機する。

> **注**: `onResume()` は既に `Promise.all([cachePromise, apiPromise])` で並行化済み。
> 改善対象は初回 `connect()` フローのみ。

#### 改善案

`connect()` を `onResume()` と同様の並行パターンに統一。
キャッシュを**即座に**表示し、API フェッチはバックグラウンドで並行実行。

```
useNoteColumn.connect():
  ┌─ [即座] loadCachedTimeline() → setNotes(cached)  ← ユーザーはすぐ読める
  └─ [非同期] api_get_timeline(sinceId) → mergeUpdate(fresh)  ← 差分追加
  ↑ Promise.all で並行（onResume と同じパターン）
```

#### 期待効果

- 初回カラム表示の体感速度が改善（特にサーバー応答が遅い環境）
- `onResume()` との設計統一でコードの一貫性向上

#### 対象ファイル

- `src/composables/useNoteColumn.ts` — `connect()` を `onResume()` パターンに統一

---

### P2.5-A: マルチサーバー同時タイムライン取得

**出典**: Nostr の複数リレー同時クエリ + Bluesky Firehose

#### 背景

Nostr クライアント (Gossip, Damus) は複数リレーに同時に REQ を送り、
最も速い応答から表示を開始する。NoteDeck もデッキの特性上、
起動時に複数サーバーへ並行リクエストすべき。

#### 現状の問題

各カラムの `api_get_timeline` は個別の Tauri invoke で直列実行される。
5 サーバー × 2 カラムの場合、最悪で 10 回の逐次 HTTP ラウンドトリップ。
サーバー応答が 200ms でも合計 2 秒の待ち時間になりうる。

#### 改善案

**Option A: Rust 側バッチコマンド（推奨）**

複数タイムライン取得を 1 つの Tauri コマンドにまとめ、
Rust 側で `tokio::join!` / `buffer_unordered` で並行実行。

```rust
#[tauri::command]
async fn batch_get_timelines(
    requests: Vec<TimelineRequest>,
    // ...
) -> Result<Vec<TimelineResponse>> {
    let futures = requests.into_iter().map(|req| {
        let client = client.clone();
        async move {
            let result = client.get_timeline(req.account_id, req.tl_type, req.options).await;
            TimelineResponse { column_id: req.column_id, result }
        }
    });

    // max_concurrent_fetches で並列度を制御
    let results: Vec<_> = futures::stream::iter(futures)
        .buffer_unordered(config.max_concurrent_fetches)
        .collect()
        .await;

    Ok(results)
}
```

**Option B: フロントエンド側 Promise.all**

既存の個別 invoke を `Promise.allSettled` でラップ。
Rust 側の変更不要だが、IPC オーバーヘッドは削減されない。

```typescript
// useDeckInit.ts
const results = await Promise.allSettled(
  columns.map(col => adapter.api.getTimeline(col.tl, col.options))
)
```

#### 期待効果

> **注**: 当初「5-10 倍高速化」と見積もったが過大評価の可能性あり。
> Vue のカラムコンポーネントは独立に mount されるため、
> **既にある程度並行化されている可能性**がある。
>
> **実装前に DevTools Timeline でカラム mount タイミングを確認すること。**
> 既に並行 mount されているなら、追加の並列化効果は限定的。
>
> 確実に効果があるのは、中央集権的に一括 fetch する Rust バッチコマンド版
> (IPC オーバーヘッド削減) だが、アーキテクチャ変更が大きい。

- P2-A (Stale-While-Revalidate) と組み合わせると「キャッシュ即表示 + 全サーバー同時差分取得」

#### 対象ファイル

- `src-tauri/src/commands/timeline.rs` — `batch_get_timelines` コマンド追加
- `src/composables/useDeckInit.ts` — 起動時の一括取得フロー
- `src-tauri/src/perf_config.rs` — `max_concurrent_fetches` を並列度制御に活用

---

### P2.5-B: 絵文字メタデータの並列プリフェッチ

#### 背景

複数サーバーのカスタム絵文字情報は、カラム初期化時に逐次取得される。
`emojisStore.ensureLoaded()` はサーバーごとに呼ばれるが、並列化されていない。

#### 改善案

起動時にログイン済みの全サーバーの絵文字を `Promise.allSettled` で並列取得し、
バックグラウンドでキャッシュに格納。

```typescript
// 起動時に全サーバーの絵文字を並列プリフェッチ
const hosts = [...new Set(accounts.map(a => a.host))]
await Promise.allSettled(
  hosts.map(host => emojisStore.ensureLoaded(host, () => adapter.api.getServerEmojis()))
)
```

#### 期待効果

- 初回ノート表示時の絵文字 fallback 表示を解消
- 3 サーバーで各 100ms の取得が 100ms に短縮

#### 対象ファイル

- `src/stores/emojis.ts` — 並列プリフェッチ呼び出し追加
- `src/composables/useDeckInit.ts` — 起動フローに組み込み

---

### P3-A: MFM パースの Rust オフロード

**出典**: Bluesky AppView 分離 + Web Worker パターン

#### 背景

Bluesky 公式アプリはリッチテキストの facet 解析をバックグラウンドで行い、
メインスレッドはレンダリングに専念する。

#### 現状の問題

`parseMfm()` はメインスレッドで同期実行。再帰パーサー + 11 正規表現パターン + 8 ブロックパターン。
LRU キャッシュ（デフォルト 256 件）ミス時にブロッキング。

> **定量見積もり**:
> - 短いノート (50 文字): ~0.1-0.5ms/回
> - 長いノート (コードブロック、数式): ~1-10ms/回
> - 100 件タイムライン初回ロード (キャッシュミス率 80-100%): **合計 10-100ms**
> - MAX_MFM_LENGTH = 10,000 文字で処理上限
>
> **実装前に DevTools Performance タブで `parseMfm` の Self Time を計測すること。**
> 10ms 以下なら不要。50ms 以上なら Web Worker 版を実装。

#### 改善案

**Option A を推奨**。Option B は ROI が悪い。

**Option A: Web Worker 版（推奨。中難易度、効果の 90%）**

既存 JS MFM パーサーを Worker に移動。メインスレッドはノンブロッキングに。

```
メインスレッド → Worker.postMessage(mfmText)
                    → Worker 内で parseMfm()
                    → Worker.postMessage(tokens)
メインスレッド ← tokens 受信 → MkMfm でレンダリング
```

**Option B: Rust 版（高難易度、最大効果）**

Rust 側に MFM パーサーを実装し、ノート正規化時にプリコンパイル。
Tauri IPC でトークン列を返す。

```
api_get_timeline() → normalize() + mfm_parse() → NormalizedNote { mfmTokens }
                                                      ↓
                                         MkMfm はトークン列をそのままレンダリング
```

#### 対象ファイル

- `src/utils/mfm.ts` — パースロジック
- `src/components/common/MkMfm.vue` — レンダリング入力形式の変更

---

## Phase 3: ActivityPub/マルチサーバー固有の最適化

中央集権サービスでは不可能/不要だが、
**ActivityPub + Misskey マルチサーバークライアントだからこそ意味がある**改善群。
Phase 1-3 の汎用的な最適化とは独立して進められる。

### P4-A: オフラインキュー (Outbox)

#### 実装済みの部分

**リアクションの楽観的更新は既に完成している**。
`toggleReaction.ts` で API 呼び出し前に UI 更新し、
失敗時に `catch` ブロックでロールバックする設計。

```typescript
// src/utils/toggleReaction.ts — 既に実装済み
note.reactions[reaction] = (note.reactions[reaction] ?? 0) + 1
note.myReaction = reaction
onMutated?.()              // ← UI 即反映
await api.createReaction()  // ← サーバーへ送信
// catch → ロールバック
```

#### 残る改善: オフライン操作キュー

楽観的更新は実装済みだが、**オフライン時の操作キューイング**は未実装。
現在はオフラインモードで書き込み操作自体がブロックされる。

ActivityPub の非同期特性上、「ネットワーク切断中も操作可能 → 復帰時にフラッシュ」
は自然なフィットであり、中央集権クライアントでは不要なパターン。

```
オフライン時:
  ユーザー操作 → noteStore に楽観的反映
              → SQLite outbox に INSERT（永続化）
              → UI に「送信待ち」インジケーター

ネットワーク復帰時:
  outbox をフラッシュ → 成功分を DELETE
                     → 失敗分はリトライ or ロールバック
```

#### 対象ファイル

- notecli 側 — SQLite `outbox` テーブル + フラッシュロジック
- `src/stores/offlineMode.ts` — `disable()` 時に outbox フラッシュ
- `src-tauri/src/commands/` — オフライン時に outbox 経由で書き込み

---

### P4-B: WebSocket 接続のインテリジェント集約

#### なぜマルチサーバーで有効か

中央集権では「接続先が 1 つ」なので接続スケジューリングは不要。
マルチサーバーでは接続数がアカウント数に比例し、スケール問題になる。

#### 現状の問題

アカウントごとに 1 本の WebSocket。同一サーバーに複数アカウントがある場合でも
独立した接続。非表示プロファイルのサーバーにも接続が維持される。

#### 改善案

**同一サーバー接続の集約**:
- 認証不要チャンネル（local/global TL）は同一サーバーで 1 本に集約
- 認証必要チャンネル（home TL, notifications）はアカウント別のまま

**優先度ベース接続管理**:
- 見えているカラムのサーバーのみ接続
- 非アクティブプロファイルのサーバーは切断
- P1-A（サブスクリプション停止）の上位互換

```
サーバー A: アカウント1 + アカウント2
  → 認証不要チャンネル: 1本の共有接続
  → 認証必要チャンネル: アカウントごとに独立

サーバー B: アカウント3（非表示プロファイル）
  → 接続なし（アクティブ化時に再接続）
```

#### 期待効果

- 同一サーバー複数アカウントでの接続数 30-50% 削減
- メモリ・CPU のサーバー数比例の増加を緩和

#### 対象ファイル

- `src/adapters/misskey/streaming.ts` — 接続プール管理
- `src-tauri/src/commands/streaming.rs` — 接続の共有ロジック

---

### P4-C: 連合 URI ベースのノートデデュプリケーション

#### なぜマルチサーバーで有効か

連合では同じノートが複数サーバー経由で届く
（A がブーストしたノートを、A のサーバーと B のサーバーの両方の TL で見る場合等）。
中央集権では「同じノートが別ルートで届く」こと自体がない。

#### 現状の問題

`noteStore` は各サーバーのローカル ID (`note.id`) をキーにしているため、
同一ノートが異なる ID で複数保持される可能性がある。

#### 前提条件

`NormalizedNote.uri` はオプショナル (`uri?: string`)。
notecli の normalize 結果に依存し、**常に含まれる保証がない**。
実装前に notecli 側で `uri` の必須化、または Misskey API の
`notes/show` レスポンスに `uri` が含まれることの確認が必要。

> ローカルノート（自サーバー発）は `uri` を持たないケースがある。
> その場合は `https://{host}/notes/{id}` で合成可能。

#### 改善案

ActivityPub の `uri` (例: `https://example.com/notes/xxx`) を正規キーとして、
同一ノートの重複を排除。

```
noteStore の二重インデックス:
  primaryKey: localId (従来通り)
  secondaryIndex: uri → localId (デデュプ用)

put(note) 時:
  if (uriIndex.has(note.uri)) {
    // 既存ノートを最新情報でマージ（リアクション数等）
    merge(existing, note)
  } else {
    // 新規ノートとして追加
    insert(note)
    uriIndex.set(note.uri, note.id)
  }
```

#### 期待効果

- 多カラムヘビーユーザーでのメモリ使用量削減
- 同一ノートへの操作（リアクション等）が全カラムに即反映

#### 対象ファイル

- `src/stores/notes.ts` — `uriIndex` の追加、`put()` にデデュプロジック
- `src/adapters/types.ts` — `NormalizedNote` に `uri` フィールドの保証

---

### P4-D: サーバーヘルスモニタリング + 部分稼働

#### なぜマルチサーバーで有効か

中央集権では接続先が 1 つなので「落ちたら終わり」だが、
マルチサーバークライアントは**部分的な稼働が可能**という固有の利点がある。

#### 改善案

notecli 側で各サーバーの応答速度・エラー率を計測し、自動で適応。

| サーバー状態 | 動作 |
|-------------|------|
| 正常 (P50 < 200ms) | 通常動作 |
| 遅延 (P50 > 500ms) | タイムアウト短縮、ポーリング間隔延長 |
| 不安定 (エラー率 > 20%) | 自動オフラインモード、復旧検知で再接続 |
| ダウン | カラムにステータス表示、他サーバーは正常稼働 |

**UI への反映**:
- ナビバーのサーバーアイコンにヘルス表示（緑/黄/赤）
- サーバーダウン時「サーバー A は現在応答がありません」をカラムヘッダーに表示
- P3-B（Relay Scoring）と統合可能

#### 対象ファイル

- `src-tauri/src/` — ヘルスチェックモジュール新設
- `src/stores/servers.ts` — ヘルス状態の reactive 管理
- `src-tauri/src/perf_config.rs` — ヘルスチェック間隔等の設定追加

---

### P4-E: サーバー機能差分の動的適応

#### なぜマルチサーバーで有効か

Misskey フォークはサーバーごとに API バージョン・機能が異なる。
中央集権では API は 1 つなのでこの柔軟性は不要。

#### 現状

`ServerInfo.features` で基本的な機能判定は実装済み（`src/core/server.ts` `detectFeatures()`）。
判定はバージョン比較のみ（`scheduledNotes` >= 2025.10.0、`groupedNotifications` >= 2024.2.0 等）。
フォーク間の細かな API 差異（リアクション上限、ドライブの有無等）は判定されない。
API フォールバックは `getUserFeaturedNotes` → `getUserNotes` の 1 箇所のみ。

#### 改善案

1. **機能マトリクスの永続化**: SQLite に `server_capabilities` テーブルを追加。
   絵文字リアクション上限、アンテナの有無、API エンドポイントの可否等を記録
2. **API フォールバック**: エンドポイントが 404 の場合、代替 API を自動試行
3. **UI 動的適応**: 未サポート機能のボタンをグレーアウト or 非表示
   （現状はエラー後に気づく）

```
adapter.api.createReaction(noteId, reaction)
  → 404 Not Found
  → adapter.fallback.createReaction(noteId, reaction)  // 代替API
  → serverCapabilities.set(host, 'reactions', false)    // 次回から直接スキップ
```

#### 対象ファイル

- `src/stores/servers.ts` — capabilities の永続化拡張
- `src/adapters/misskey/api.ts` — フォールバックロジック
- notecli 側 — SQLite `server_capabilities` テーブル

---

### Phase 4 の定量評価

> Phase 4 の施策は**パフォーマンスよりも信頼性・正確性・UX の改善**であり、
> パフォーマンス目的で優先すべきものはない。
> ユーザーからの具体的な問題報告を受けてから着手すべき。

| 施策 | 定量的効果 | 判定 |
|------|-----------|------|
| P4-B WebSocket 集約 | 同一サーバー 2 アカウントで ~10KB 節約。少数派ユースケース | **見送り** |
| P4-D ヘルスモニタリング | 信頼性改善。パフォーマンス効果なし | **問題報告待ち** |
| P4-C URI デデュプ | noteStoreMax=1500 中の重複 5-10% → 75-750KB 節約 | **見送り** |
| P4-E 機能差分適応 | 正確性改善。パフォーマンス効果なし | **問題報告待ち** |
| P4-A オフラインキュー | 楽観的更新は実装済み。オフライン投稿は低頻度 | **見送り** |

---

## 補足: 見送り・低優先度の候補

| 候補 | 出典 | 見送り理由 |
|------|------|-----------|
| CID 風ハッシュ比較による resolve 最適化 | Bluesky AT Protocol | 現在の参照比較で十分。複雑性に見合わない |
| LMDB デュアルストア | Nostr Gossip | SQLite 性能がボトルネックの証拠なし |
| SharedArrayBuffer マルチウィンドウ | TweetDeck | Tauri イベントで共有済み。COOP/COEP 設定が複雑 |
| Service Worker オフライン | PWA 文化 | Tauri アプリでは Rust キャッシュ層が同等の役割 |
| Snowflake ID ソート最適化 | Twitter | 現在のリストサイズ (200-300 件) では O(n) で十分 |
| スナップショット TTL 緩和 | Bluesky | 既存実装がかなり完成。微調整レベル |
| L-1 キャッシュ層 (computed バイパス) | Twitter Manhattan | `skipTrigger` で部分的に実現済み |
| rayon CPU 並列 (画像デコード等) | Rust エコシステム | `worker_threads=2` の現設定では効果限定的。I/O バウンドが支配的 |
| 通知の複数サーバー同時ポーリング | Nostr 複数リレー | WebSocket 接続時は不要。フォールバック時のみ有効で優先度低 |
| 連合グラフ活用のプリフェッチ | ActivityPub | `/api/federation/stats` の信頼性がサーバーごとに異なる。効果大だが実装コストも大 |
| サーバーサイドフィルタリング最大活用 | Bluesky Feed Generator | Misskey API パラメータ (`withRenotes` 等) は既に渡されている可能性高。追加インパクト小 |
| 分散キャッシュとしてのクライアント | ActivityPub | クロスサーバー検索・連合グラフルーティング等。差別化要素だが実装コスト巨大。長期構想として記録 |
| Compositor-Only CSS 監査 | Web パフォーマンス | 問題が報告されていない。frameTelemetry でジャンク検出されてから着手 |
| アダプティブプリフェッチ | TweetDeck | prefetchAhead=30 で十分。高速スクロール時の画像遅延が報告されない限り不要 |
| ノート詳細並列取得 | Rust 並列処理 | 表示頻度がタイムラインより低い。notecli API 変更が必要で工数に見合わない |
| マルチサーバー同時タイムライン取得 | Nostr 複数リレー | Vue async mount で既に 11ms 以内に全カラム並行開始。追加の並列化は不要（実測で確認済み） |
| resolve() spread 削除 | noteStore 最適化 | renote 参照の stale 検出で**必要**。spread は浅コピーで軽量。別タイムライン経由の更新をカバーするため不可欠 |
| stream-event listener 統合 | Singleton 化 | 世代チェック + unlistenFns で既に堅牢。2-5 アカウントでは実質無視できるオーバーヘッド |
| ReactionPicker 仮想スクロール | grid 仮想化 | セクション折りたたみ (`initialOpen=false` + `v-if`) で既に遅延レンダリング済み。展開時も数百個程度 |

---

## 知見の出典

### Bluesky / AT Protocol

- **AppView 分離**: データ加工をサーバー/バックエンド側に集約し、クライアントは表示に専念
- **Feed Generator**: サーバーサイドでフィード計算を完結させ、クライアントのフィルタリングコストをゼロに
- **Content-Addressed Storage (CID)**: 不変ハッシュによるキャッシュ。同一 CID = 安全に再利用
- **画面外コンテンツ完全アンマウント**: 復帰はインメモリキャッシュから瞬時復元

### Nostr

- **NIP-01 REQ/CLOSE**: 不要サブスクリプションの即時破棄でリレー負荷・クライアント処理負荷を最小化
- **Local Relay**: ローカルに NIP-01 互換リレーを立て、オフラインでもシームレスに動作
- **Relay Scoring**: Gossip/Damus のリレースコアリング。レイテンシ・可用性の EMA 追跡で最適リレー選択
- **Gossip (Rust 製)**: LMDB で zerocopy イベント読み書き。outbox model でユーザー毎の最適リレー追跡

### ActivityPub / 分散システム

- **楽観的書き込み (Optimistic UI)**: 非同期プロトコルの特性を活かし、ローカル即反映 + サーバー確認で reconcile
- **連合 URI デデュプ**: 複数サーバー経由で届く同一ノートを ActivityPub URI で重複排除
- **部分稼働**: 1 サーバーがダウンしても他サーバーのカラムは正常稼働（中央集権にはない利点）
- **分散キャッシュ**: クライアントが複数サーバーのデータを持つこと自体がクロスサーバー検索・耐障害性の基盤
- **機能差分適応**: サーバーごとの API 差異を動的に検出・適応する adapter 層の柔軟性

### 旧 Twitter OSS / TweetDeck

- **Finagle バックプレッシャー**: 処理しきれない場合の明示的ドロップ + 差分再取得フロー
- **Snowflake ID**: 時間ソート可能 64bit ID。ID 比較のみで時系列クエリ実現
- **Manhattan/Memcache マルチティア**: ホットデータの読み取りオーバーヘッド最小化
- **TweetDeck 高速スクロール**: スクロール速度に応じたアダプティブプリフェッチ
