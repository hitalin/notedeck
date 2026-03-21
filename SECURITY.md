# NoteDeck セキュリティアーキテクチャ

NoteDeck のセキュリティ設計と実装状況をまとめたドキュメント。

## 総合評価

| 領域 | 評価 | 備考 |
|------|------|------|
| XSS 対策 | **A** | DOMPurify + ホワイトリストで全 v-html を保護 |
| SSRF 対策 | **A** | プライベート IP / ループバック完全ブロック |
| 認証・トークン管理 | **A** | OS キーチェーン + メモリ zeroize |
| 入力検証 | **A-** | URL・ホスト・CSS パラメータを厳密に検証 |
| ネットワーク | **A** | HTTPS 強制 + localhost 限定サーバー |
| 耐障害性 | **A-** | サーキットブレーカー + ネガティブキャッシュ |

---

## 1. XSS 対策

すべての `v-html` 出力は DOMPurify でサニタイズ済み。許可タグ・属性をホワイトリストで明示指定。

### KaTeX 数式レンダリング

- **ファイル**: `src/components/common/MkMfm.vue`
- `katex.renderToString()` の出力を DOMPurify でサニタイズ
- `trust: false`, `strict: 'error'` で危険な TeX コマンドを拒否
- 許可タグ: MathML 要素 (`math`, `mrow`, `mi`, `mo`, `mfrac` 等) + SVG 描画要素
- catch フォールバックは `escapeHtml()` で安全にエスケープ

### コードハイライト

- **ファイル**: `src/utils/highlight.ts`
- Shiki の出力を DOMPurify でサニタイズ
- 許可タグ: `pre`, `code`, `span` のみ
- 許可属性: `class` のみ
- ハイライター未ロード時は `escapeHtml()` でフォールバック

### サーバー情報表示

- **ファイル**: `src/components/deck/DeckServerInfoColumn.vue`
- サーバー概要・ルールともに DOMPurify + ホワイトリストでサニタイズ
- `iframe`, `script`, `object` 等は全てブロック

---

## 2. SSRF 対策

### ホスト検証 (Rust バックエンド)

- **ファイル**: `src-tauri/src/commands.rs` — `validate_host()`
- ブロック対象:
  - ループバック: `localhost`, `127.*`, `::1`, `[::1]`
  - プライベート IP: `10.*`, `192.168.*`, `172.16.0.0/12`
  - リンクローカル: `169.254.*`, `fe80:`
  - IPv6 ULA: `fc*`, `fd*`
  - IPv4-mapped IPv6: `::ffff:`
- ホスト名: 最大 253 文字、`/`, `?`, `#`, `@`, 空白を拒否

### URL 検証 (フロントエンド)

- **ファイル**: `src/utils/url.ts`
- `isSafeUrl()`: `http://` / `https://` のみ許可
- `safeCssUrl()`: CSS `url()` 内のプロトコル検証 + 文字エスケープ

---

## 3. 認証・トークン管理

### 多層トークン保護

| 層 | 実装 | ファイル |
|----|------|----------|
| 永続化 | OS キーチェーン (primary) | `src-tauri/src/commands.rs` |
| フォールバック | DB 保存 → キーチェーンへ自動移行 | 同上 |
| メモリ | TTL 60秒キャッシュ + `Zeroize` trait | 同上 |
| 破棄 | `Drop` 実装でメモリを即時ゼロ化 | 同上 |

- DB にトークンが残っている場合、キーチェーン保存成功後に DB から削除
- アカウントエクスポート JSON にはトークンを含めない（`id`, `host`, `username` のみ）

### 認証セッション管理

- `AuthSessionTracker`: セッション TTL 15分、ワンタイム消費
- ホスト不一致検出（リプレイ攻撃対策）
- 期限切れセッションは新規登録時に自動クリーンアップ

### 内部 API 認証

- **ファイル**: `src-tauri/src/http_server.rs`
- localhost (`127.0.0.1:19820`) のみバインド
- Bearer Token で全エンドポイントを保護
- 不正トークンには 401 Unauthorized を返却

---

## 4. 入力検証

### API エンドポイントパラメータ

- エンドポイント: 最大 100 文字、`[a-zA-Z0-9/-]` のみ
- ユーザー名: 文字数・文字種を制限

### AiScript コードサニタイズ

- **ファイル**: `src/aiscript/sanitize.ts` — `sanitizeCode()`
- BOM (U+FEFF) 除去
- ゼロ幅文字除去: U+200B〜U+200F, U+2060
- NBSP → 通常スペース変換
- 改行正規化 (CRLF/CR → LF)

### MFM CSS パラメータ検証

- **ファイル**: `src/components/common/MkMfm.vue`
- HEX カラー: `/^[0-9a-fA-F]{3,8}$/`
- CSS 時間: `/^\d+(\.\d+)?(s|ms)$/`
- CSS 数値: `/^-?\d+(\.\d+)?$/`
- ボーダースタイル: ホワイトリスト (`solid`, `dashed`, `dotted` 等)

---

## 5. コンテンツセキュリティ

### 画像プロキシ

| 制御 | 値 | ファイル |
|------|-----|----------|
| プロトコル | HTTPS のみ | `src-tauri/src/image_cache.rs` |
| 最大サイズ | 20 MB | 同上 |
| 同時取得数 | 50 (semaphore) | 同上 |
| タイムアウト | 5 秒 | 同上 |
| サーキットブレーカー | 3 連続失敗 → 60 秒ブロック | 同上 |
| ネガティブキャッシュ | 4xx: 24h / 5xx: 5min / timeout: 1min | 同上 |
| メモリキャッシュ | LRU, 64KB/item, 32MB 上限 | 同上 |
| ディスクキャッシュ | 7 日 TTL | 同上 |

### OGP フェッチ

- **ファイル**: `src-tauri/src/ogp/mod.rs`
- HTTPS 限定
- リダイレクト: 最大 5 回
- タイムアウト: 5 秒
- Player URL: 既知の壊れたドメインをブロック (`embed.pixiv.net` 等)
- OGP 画像: HTTPS URL のみ抽出

---

## 6. ネットワークセキュリティ

### TLS

- バックエンド: `rustls-tls` (純 Rust TLS 実装、OpenSSL 非依存)
- フロントエンド: 外部リソースはすべて HTTPS 経由

### localhost 限定サーバー

- 内部 HTTP サーバーは `127.0.0.1:19820` にバインド
- 外部ネットワークからアクセス不可
- `CorsLayer::permissive()` — localhost 限定のため許容

---

## 7. Tauri セキュリティ設定

### Capabilities (権限モデル)

- **default** (`src-tauri/capabilities/default.json`): ウィンドウ操作、通知、ダイアログ等の最小権限
- **desktop** (`src-tauri/capabilities/desktop.json`): グローバルショートカット、自動起動、アップデーター
- ファイルシステムアクセス: 明示的に許可されていない
- シェル実行: 許可なし
- HTTP fetch: Tauri の capabilities では許可せず、Rust 側で独自実装

---

## 8. 依存ライブラリ

### フロントエンド

| ライブラリ | 用途 |
|-----------|------|
| `dompurify` | HTML サニタイズ (XSS 防止) |
| `katex` | 数式レンダリング (`trust: false`) |
| `shiki` | コードハイライト |

### バックエンド

| クレート | 用途 |
|---------|------|
| `zeroize` | 機密メモリのゼロ化 |
| `reqwest` + `rustls-tls` | HTTPS 通信 |
| `axum` | HTTP サーバーフレームワーク |
| `scraper` | OGP HTML パース |
| `sha2` | キャッシュキーのハッシュ化 |
| `lru` | キャッシュ LRU 管理 |

---

## 9. 設計原則

1. **多層防御**: トークンは OS キーチェーン + メモリキャッシュ (TTL + zeroize) + DB フォールバック
2. **最小権限**: localhost 限定サーバー、Tauri capabilities で必要最小限の権限のみ許可
3. **フェイルセーフ**: HTTPS 強制、DOMPurify デフォルトブロック、catch 時は escapeHtml
4. **入力正規化**: ホスト名小文字化、Unicode 正規化、CSS パラメータ検証
5. **耐障害性**: サーキットブレーカー + ネガティブキャッシュで壊れた上流の影響を遮断

---

## 10. 既知の制限と今後の検討

| 項目 | 状態 | 備考 |
|------|------|------|
| CSP ヘッダー | 未設定 | Tauri WebView のデフォルト CSP に依存 |
| セキュリティイベントログ | 未実装 | 認証失敗等のログ記録 |
| ユーザー単位レート制限 | 未実装 | 現在はグローバル制限のみ |
