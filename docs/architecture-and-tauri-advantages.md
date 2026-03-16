# NoteDeck アーキテクチャ解説 & Tauri V2 だからこそのアーキテクチャ

## 1. 現状のアーキテクチャ全体像

```
┌─────────────────────────────────────────────────────────────────┐
│                        NoteDeck Application                      │
│                                                                   │
│  ┌─────────────────────────────────┐  ┌────────────────────────┐ │
│  │     Frontend (WebView)          │  │   Rust Backend          │ │
│  │                                 │  │                         │ │
│  │  Vue 3 + TypeScript + Vite      │  │  ┌───────────────────┐ │ │
│  │                                 │  │  │ Tauri IPC Layer    │ │ │
│  │  ┌───────────┐ ┌────────────┐  │  │  │ (80+ commands)     │ │ │
│  │  │ Pinia     │ │ Vue Router │  │  │  └───────┬───────────┘ │ │
│  │  │ Stores    │ │            │  │  │          │             │ │
│  │  │ (13個)    │ │            │  │  │  ┌───────▼───────────┐ │ │
│  │  └─────┬─────┘ └────────────┘  │  │  │ notecli Library   │ │ │
│  │        │                        │  │  │ (Misskey API)     │ │ │
│  │  ┌─────▼──────────────────────┐ │  │  └───────┬───────────┘ │ │
│  │  │ Composables (37個)         │ │  │          │             │ │
│  │  │ - useNoteList              │ │  │  ┌───────▼───────────┐ │ │
│  │  │ - useColumnSetup           │ │  │  │ SQLite (WAL+FTS5) │ │ │
│  │  │ - useStreamingBatch        │ │  │  └───────────────────┘ │ │
│  │  │ - useDeckWindow            │ │  │                         │ │
│  │  │ - useEmojiResolver         │ │  │  ┌───────────────────┐ │ │
│  │  │ - ...                      │ │  │  │ Axum HTTP Server  │ │ │
│  │  └────────────────────────────┘ │  │  │ (localhost:19820)  │ │ │
│  │                                 │  │  └───────────────────┘ │ │
│  │  ┌────────────────────────────┐ │  │                         │ │
│  │  │ Server Adapter Layer       │ │  │  ┌───────────────────┐ │ │
│  │  │ (Misskey/Firefish/Sharkey) │ │  │  │ Streaming Manager │ │ │
│  │  └────────────────────────────┘ │  │  │ (WebSocket)       │ │ │
│  └─────────────────────────────────┘  │  └───────────────────┘ │ │
│              ▲           ▲             │                         │ │
│              │  Tauri IPC │             │  ┌───────────────────┐ │ │
│              │  & Events  │             │  │ Image Cache       │ │ │
│              ▼           ▼             │  │ (3層: Mem/Disk/Net)│ │ │
│  ┌─────────────────────────────────┐  │  └───────────────────┘ │ │
│  │      Tauri V2 Core              │  │                         │ │
│  │  - IPC Bridge                   │  │  ┌───────────────────┐ │ │
│  │  - Event System (emit/listen)   │  │  │ OGP Cache         │ │ │
│  │  - Multi-Window Management      │  │  │ (SQLite-backed)   │ │ │
│  │  - Plugin System                │  │  └───────────────────┘ │ │
│  └─────────────────────────────────┘  └────────────────────────┘ │
│                                                                   │
│  Plugins: notification, global-shortcut, autostart, updater,      │
│           opener, os, process                                     │
└───────────────────────────────────────────────────────────────────┘
```

## 2. レイヤー別の詳細

### 2.1 フロントエンド層

**Pinia Stores (13個)** — アプリケーション状態管理:
| Store | 役割 |
|-------|------|
| `accounts` | マルチアカウント管理 |
| `deck` | デッキ・カラム・レイアウト・プロファイル管理 |
| `streaming` | WebSocket接続状態・購読管理 |
| `notes` | ノートのキャッシュ・正規化 |
| `emojis` | カスタム絵文字管理 |
| `servers` | 接続先サーバー情報 |
| `theme` | テーマ設定 |
| `ui` | UI状態 |
| `keybinds` | キーバインド設定 |
| `windows` | マルチウィンドウ管理 |
| `plugins` | AiScriptプラグイン |
| `pinnedReactions` | ピン留めリアクション |
| `recentEmojis` | 最近使った絵文字 |

**Server Adapter パターン**:
```
types.ts          → 共通インターフェース定義
registry.ts       → アダプター登録・解決
misskey/           → Misskey固有実装
initAdapter.ts    → サーバー種別の自動検出・初期化
```
Misskey 本体および Firefish, Sharkey, Iceshrimp 等のフォークに対応。

### 2.2 バックエンド層 (Rust)

| モジュール | 役割 |
|-----------|------|
| `commands.rs` | Tauri IPCコマンド (80+個)。認証・API呼び出し・キーチェーン操作 |
| `streaming.rs` | `FrontendEmitter` トレイト実装。WebSocket→Tauriイベント変換 + ネイティブ通知 |
| `http_server.rs` | Axum HTTPサーバー (localhost:19820)。REST API + SSE + OpenAPI |
| `query_bridge.rs` | HTTP API → フロントエンド間の双方向ブリッジ |
| `image_cache.rs` | 3層画像キャッシュ (メモリLRU / ディスク / ネットワーク) |
| `ogp/` | OGPメタデータ取得・パース・キャッシュ |

**notecli (外部クレート)**: Misskey API クライアント、DB、WebSocket streaming、キーチェーン等のコアロジック。

### 2.3 通信パターン

```
Frontend ←→ Backend の通信は3種類:

1. Tauri IPC (同期的リクエスト/レスポンス)
   Frontend → invoke("api_get_timeline", {...}) → Rust command → Response

2. Tauri Event System (非同期・双方向)
   Rust → emit("stream-event", payload) → Frontend listens
   Frontend → emit("nd:query-request") → Rust listens → emit("nd:query-response-{id}")

3. Localhost HTTP API (外部ツール連携)
   External Tool → HTTP GET /api/{host}/timeline/home → Axum → notecli → Response
   External Tool → SSE /api/events → リアルタイムイベント受信
```

---

## 3. Tauri V2 だからこそ可能なアーキテクチャ

### 3.1 Query Bridge パターン (最もユニーク)

```rust
// query_bridge.rs — HTTP API がフロントエンドの状態を直接クエリする
pub async fn query_frontend(app: &AppHandle, query_type: &str, params: Value) -> Result<Value, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = tokio::sync::oneshot::channel::<Value>();
    // Rust → フロントエンドにイベント発火 → フロントエンドが応答 → Rustが受信
    app.emit("nd:query-request", json!({ "id": id, "type": query_type, "params": params }))?;
    tokio::time::timeout(Duration::from_secs(5), rx).await??
}
```

**これが意味すること**: 外部HTTPクライアント（curl, スクリプト, AIエージェント等）が `GET /api/deck/columns` を叩くと、Axum → Tauri Event → Vue/Pinia → Tauri Event → Axum → HTTP Response という経路でフロントエンドのリアクティブ状態を直接返せる。

**Slint では不可能**: Slint にはイベントバスやフロントエンド→バックエンドの非同期メッセージングがないため、このようなバックエンドからフロントエンド状態を逆クエリするパターンは実装できない。

### 3.2 マルチウィンドウ・デッキアーキテクチャ

```typescript
// useDeckWindow.ts — カラムを別ウィンドウにポップアウト
const win = new WebviewWindow(windowId, {
  url: `/?profile=${profileId}&window=${windowId}`,
  width: 500, height: 700,
  decorations: false,
});
```

**Tauri V2 固有の利点**:
- `WebviewWindow` APIで動的にウィンドウ生成・破棄
- 各ウィンドウが同一 Vue アプリの独立インスタンス（URLパラメータで挙動を分離）
- **クロスウィンドウ D&D**: `emit('deck:drag-start')` / `emit('deck:move-column')` でウィンドウ間のカラム移動
- **ウィンドウレイアウト保存/復元**: モニター切断時の自動再配置ロジック
- **ウィンドウ閉鎖時の自動リコール**: サブウィンドウが閉じるとカラムがメインに戻る

**Slint では**: マルチウィンドウは一応可能だが、ウィンドウ間のイベント伝搬機構がなく、同一アプリの独立インスタンスを URL パラメータで分離するパターンは Web 技術特有。

### 3.3 ストリーミング → ネイティブ通知ブリッジ

```rust
// streaming.rs
impl FrontendEmitter for TauriEmitter {
    fn emit(&self, event: &str, payload: Value) {
        if event == "stream-notification" {
            self.send_native_notification(&payload);  // OS通知
        }
        self.app.emit("stream-event", wrapped)?;       // WebView通知
    }
}
```

**Tauri V2 の利点**: WebSocket からのストリームデータを一箇所で:
1. OS ネイティブ通知として発行 (`tauri-plugin-notification`)
2. フロントエンドにイベントとして転送 (`app.emit`)
3. SSE で外部クライアントにブロードキャスト (EventBus)

これは「Rust バックエンドが通信ハブとして機能し、複数の出力先に同時配信する」パターンで、WebView + Rust の二重構造だからこそ自然に成立する。

### 3.4 二重API (IPC + HTTP) アーキテクチャ

```
同じバックエンドロジックを2つのインターフェースで公開:

1. Tauri IPC  (フロントエンド向け、高速、型安全)
   → commands::api_get_timeline()

2. Axum HTTP  (外部向け、Bearer認証、OpenAPI仕様書付き)
   → GET /api/{host}/timeline/{type}
   → SSE /api/events
   → GET /proxy/image?url=...
```

**これが可能にすること**:
- CLI ツールから NoteDeck を操作 (`curl`)
- AI エージェント（Ollama等）がノートを投稿
- 外部スクリプトでタイムラインを監視
- ブラウザから API ドキュメント (`/api/docs`) を閲覧

**Slint では**: HTTP サーバーを並行起動すること自体は可能だが、「フロントエンド状態を HTTP 経由で外部に公開する」Query Bridge パターンが成立しないため、デッキ状態の外部公開などが困難。

### 3.5 画像プロキシ + 3層キャッシュ

```
ブラウザ (ETag) → Axum (/proxy/image) → メモリ LRU (32MB)
                                        → ディスクキャッシュ (24h TTL)
                                        → アップストリーム (ストリーミング配信)
```

WebView の `<img src="http://127.0.0.1:19820/proxy/image?url=...">` で Rust 側のプロキシを経由。CSP で外部画像を直接ロードせず、Rust 側でキャッシュ・サイズ制限・ETag を処理。

**Tauri V2 の利点**: CSP 設定 + localhost HTTP の組み合わせで、WebView のセキュリティモデルと Rust の高性能キャッシュを統合。

### 3.6 グローバルショートカット + ボスキー

```rust
// Ctrl+Shift+B — ウィンドウ非表示/表示 (ボスキー)
app.global_shortcut().on_shortcut(boss_key, |app, _, event| {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible()? { w.hide(); } else { w.show(); w.set_focus(); }
    }
});

// Ctrl+Alt+N — クイックノート (ウィンドウ表示 + フロントエンドイベント)
app.global_shortcut().on_shortcut(quick_note, |app, _, event| {
    w.show(); w.set_focus();
    w.emit("nd:quick-note", ());  // フロントエンドが投稿フォームを開く
});
```

**Tauri V2 の利点**: OS レベルのグローバルショートカットから、ウィンドウ制御とフロントエンドイベントの両方を制御。

### 3.7 条件付きコンパイルによるプラットフォーム分岐

```rust
#[cfg(not(mobile))]  // デスクトップのみ
{
    builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(...));
    // + システムトレイ
    // + ボスキー
}

#[cfg(target_os = "android")]  // Android のみ
{
    let channel = Channel::builder(NOTIFICATION_CHANNEL_ID, "通知")
        .importance(Importance::Default).build();
}
```

同一コードベースでデスクトップ (トレイ、グローバルショートカット、自動更新) とモバイル (通知チャンネル) を分岐。

---

## 4. まとめ: Tauri V2 が実現するアーキテクチャの本質

NoteDeck のアーキテクチャの核心は **「Rust バックエンドを通信ハブとした多面的な I/O」** にある:

```
                    ┌─────────────┐
 Misskey Server ◄──►│             │◄──► WebView (Vue 3)
   (WebSocket)      │   Rust      │       ↕ Tauri IPC
                    │   Backend   │       ↕ Tauri Events
 Misskey Server ◄──►│   (Hub)     │◄──► OS (通知, トレイ, ショートカット)
   (HTTP API)       │             │
                    │             │◄──► 外部ツール (HTTP API + SSE)
 SQLite DB ◄───────►│             │
                    │             │◄──► ファイルシステム (画像キャッシュ)
 OS Keychain ◄─────►│             │
                    └─────────────┘
```

この「Rust が中央集権的にすべての I/O を管理し、フロントエンドは UI に専念する」パターンは、**Tauri V2 の IPC + Event System + Plugin 機構があって初めて実用的に成立する**。Slint のような Rust ネイティブ GUI では UI とロジックが密結合になり、このような柔軟な分離アーキテクチャは実現しにくい。
