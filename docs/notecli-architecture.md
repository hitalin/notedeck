# notecli アーキテクチャ分析

notecli は notedeck のコア基盤となる Rust クレートであり、**スタンドアロン CLI ツール** と **ライブラリ** の二重の役割を持つ。このドキュメントでは、その設計思想と主要アーキテクチャパターンを分析する。

## 1. デュアルパーパス・クレート設計

notecli は単一のクレートでありながら、2つの異なるコンテキストで動作する：

| モード | エントリポイント | FrontendEmitter | HTTP サーバー |
|--------|------------------|-----------------|---------------|
| **CLI** | `main.rs` (clap) | `NoopEmitter` | なし |
| **デーモン** | `main.rs --daemon` | `EventBusEmitter` | Axum (16ルート) |
| **notedeck 組込** | `lib.rs` (ライブラリ) | `TauriEmitter` (notedeck側) | 拡張版 Axum (39ルート) |

この設計により、同じビジネスロジック（API呼び出し、DB操作、ストリーミング）が CLI・デーモン・GUI のすべてで共有される。

## 2. FrontendEmitter トレイトパターン

```
streaming.rs で定義:
  trait FrontendEmitter: Send + Sync
    fn emit(&self, event: &str, payload: Value)
```

**なぜこれが重要か：**

ストリーミング（WebSocket）からのイベントをフロントエンドに届ける方法は、実行環境によって根本的に異なる：

- **CLI**: イベントは不要 → `NoopEmitter`（何もしない）
- **デーモン**: SSE で HTTP クライアントへ配信 → `EventBusEmitter`（broadcast channel経由）
- **Tauri GUI**: Tauri Event System で Vue へ配信 → `TauriEmitter`（notedeck側で実装）

この抽象化により、`StreamingManager` は実行環境を一切知らずにイベントを配信できる。典型的な Strategy パターンの適用例。

## 3. Raw → Normalized モデル変換

### 問題
Misskey の API レスポンスは：
- フォーク（Firefish, Sharkey, CherryPick 等）によってフィールドが異なる
- ネストが深い（user.instance.faviconUrl 等）
- フロントエンドに不要な情報を含む

### 解決策：2層モデル

```
RawNote (API応答そのまま)
  ├── #[serde(flatten)] extra: HashMap<String, Value>  ← フォーク固有フィールド
  └── normalize() → NormalizedNote (フロントエンド用)
                      ├── mode_flags (extra から抽出)
                      └── フラット化された必須フィールドのみ
```

**`#[serde(flatten)]` の活用が秀逸：**
- 既知のフィールドは型安全にデシリアライズ
- 未知のフィールド（フォーク固有）は `extra` に自動収集
- `normalize()` 時に `extra` から `isNoteIn*Mode` 等のフラグを抽出

これにより、新しいフォーク固有フィールドが追加されても **notecli 側のコード変更なし** で対応できる。

### Account の Drop 時 zeroize

```rust
impl Drop for Account {
    fn drop(&mut self) {
        self.token.zeroize();
    }
}
```

トークンがメモリに残留するリスクを最小化。`get_credentials()` でも `db_token.zeroize()` を明示的に呼んでいる。

## 4. FTS5 トライグラム検索

### 問題
Misskey のサーバーサイド検索は遅く、ローカルキャッシュされたノートを高速検索したい。しかし SQLite の標準トークナイザーは CJK（日本語・中国語・韓国語）に対応していない。

### 解決策

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
    text, cw,
    content=notes_cache,
    content_rowid=rowid,
    tokenize='trigram'
);
```

- **trigram トークナイザー**: 3文字単位でインデックスを構築するため、スペース区切りでない言語でも部分文字列検索が可能
- **contentless FTS**: `content=notes_cache` で実データへのポインタのみ保持し、ストレージを節約
- **CW（Content Warning）も検索対象**: 隠されたテキストも検索可能

### インクリメンタルマイグレーション

```rust
fn ensure_column(conn: &Connection, table: &str, col: &str, col_type: &str)
```

`pragma_table_info` でカラムの存在を確認してから `ALTER TABLE ADD COLUMN` を実行。バージョンテーブルを使わないシンプルなマイグレーション戦略。

## 5. プラットフォーム・キーチェーン抽象化

```rust
fn init_store(account_id: &str) -> Result<Entry, ...> {
    #[cfg(target_os = "android")]  → AndroidNativeCredentialStore
    #[cfg(target_os = "macos")]    → IosKeychain::Authenticated
    #[cfg(target_os = "ios")]      → IosKeychain::Authenticated
    #[cfg(target_os = "windows")]  → WindowsNativeCredentialStore
    #[cfg(target_os = "linux")]    → LinuxKeyutilsPersistentStore
}
```

**クレデンシャル解決の優先順位** (`lib.rs:get_credentials`):

```
1. キーチェーン → 見つかれば使用（DB にトークン残っていれば消去）
2. DB フォールバック → 見つかればキーチェーンへ遅延移行を試行
3. どちらもなければ → Auth エラー
```

この「遅延移行」設計により、キーチェーン機能追加前の既存ユーザーが自然にセキュアな保存方式へ移行する。

## 6. ストリーミング・マネージャー

### 接続管理

```
StreamingManager
  └── connections: HashMap<String, ConnectionHandle>
        └── ConnectionHandle
              ├── JoinHandle (WebSocket タスク)
              ├── mpsc Sender (コマンド送信)
              └── subscriptions: Vec<Subscription> (再接続時リプレイ用)
```

### 指数バックオフ再接続

```
接続断 → 1秒待機 → 再接続試行 → 失敗 → 2秒待機 → ... → 最大30秒
成功 → バックオフリセット + 全サブスクリプション再送信
```

### WsCommand による制御

```rust
enum WsCommand {
    Subscribe { body, kind, id },   // チャンネル購読
    Unsubscribe { id },             // 購読解除
    SubNote { note_id },            // ノート個別監視（リアクション通知用）
    UnsubNote { note_id },          // 監視解除
    Shutdown,                       // 接続終了
}
```

`SubNote` は Misskey 独自の概念で、特定ノートのリアクション・投票・削除をリアルタイム監視する。

### メッセージハンドリング

受信メッセージの処理フロー：
```
WebSocket メッセージ受信
  → JSON パース
  → body.type で分岐
    → "note": spawn_blocking で DB キャッシュ + FrontendEmitter.emit()
    → "notification": FrontendEmitter.emit()
    → "followed", "reaction" 等: FrontendEmitter.emit()
```

`spawn_blocking` の使用は重要：SQLite 書き込みは同期的でブロッキングするため、非同期タスクを止めないよう専用スレッドプールに委譲している。

## 7. CLI 設計：Unix 哲学の適用

### 5つの出力フォーマット

| フォーマット | 用途 | パイプ適性 |
|-------------|------|-----------|
| Default | 人間が読む | △ |
| JSON | プログラム処理 | ◎ |
| JSONL | ストリーム処理 | ◎ |
| IDs | パイプライン | ◎ |
| Compact (TSV) | 一覧表示 | ○ |

### Unix ツール統合の具体例（ヘルプテキストより）

```bash
# fzf でインタラクティブにタイムラインを選択
notecli tl -f compact | fzf | cut -f1 | xargs notecli note

# jq でノートの特定フィールドを抽出
notecli tl -f json | jq '.[].text'

# ID リストをパイプで削除
notecli tl -f ids | xargs -I{} notecli delete {}
```

### アカウント解決の柔軟性

```
notecli tl @user@misskey.io   # 完全修飾
notecli tl abc123             # アカウントID
notecli tl user               # ユーザー名（部分一致）
```

## 8. HTTP サーバーの二重構造

### notecli 版（16ルート）
- スタンドアロンデーモン用
- Bearer トークン認証
- SSE イベントストリーム
- CORS 対応
- `build_router()` をエクスポート（テスト可能性）

### notedeck 版（39ルート）
- notecli の `build_router()` を **使用せず**、独自に全ルートを再定義
- 追加機能：デッキ状態管理、コマンドパレット、画像プロキシ（3層キャッシュ）、OGP
- Query Bridge パターン（フロントエンド状態の逆引き）

**アーキテクチャ上の課題：**
notedeck は notecli の `build_router()` を再利用せず独自実装しているため、API の一貫性維持にコストがかかる。理想的には notecli のルーターを基盤として、notedeck 固有のルートを追加マウントする構成が望ましい。

## 9. エラーハンドリング戦略

### safe_message() パターン

```rust
match self {
    Self::Database(e) => {
        eprintln!("[error] Database: {e}");     // 内部詳細はログへ
        "Database operation failed".to_string() // 汎用メッセージをフロントエンドへ
    }
    Self::Api { message, .. } => message.clone(), // 制御下のメッセージはそのまま
}
```

**設計意図：**
- SQLite クエリ、ネットワークトレース、キーチェーン内部情報はセキュリティ上フロントエンドに露出させない
- API エラーメッセージや入力バリデーションエラーは開発者が制御しているため安全に表示
- `Serialize` 実装で `code` + `safe_message` のペアを自動生成 → フロントエンドでのエラーハンドリングが統一的

## 10. 総合評価

### 強み
1. **デュアルパーパス設計**: CLI とライブラリの境界が明確で、コード再利用率が高い
2. **FrontendEmitter による環境抽象化**: 実行環境の差異をきれいに分離
3. **フォーク互換性**: `serde(flatten)` による未知フィールド収集は、Fediverse の多様性に適した設計
4. **セキュリティ意識**: トークンの zeroize、safe_message、read_body_limited (50MB)
5. **CJK 対応**: FTS5 trigram は日本語ユーザー向けアプリとして必須の選択

### 改善の余地
1. **HTTP サーバーの重複**: notecli と notedeck で API ルートが二重定義されている
2. **DB マイグレーション**: カラム追加のみ対応。テーブル構造の大幅変更にはバージョニングが必要になる可能性
3. **テストの不在**: テストコードが見当たらない（`build_router()` のエクスポートはテスト意図があるが未実装）
4. **エラー型の粒度**: `Auth(String)` や `WebSocket(String)` は文字列ベースで、パターンマッチによる回復処理が困難
