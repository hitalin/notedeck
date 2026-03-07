# NoteDeck Roadmap

## ポジショニング

NoteDeck は**デスクトップ専用**の Misskey デッキクライアントである。

- **ターゲット**: 複数サーバーのタイムラインを常時監視するパワーユーザー
- **対象プラットフォーム**: Windows / macOS / Linux のみ。モバイルはサポートしない
- **ゴール**: 日常操作の 80% をデスクトップ内で完結させ、Web UI を開く頻度を最小化する

### なぜデスクトップ専用か

- デッキ UI のコア価値（複数カラム同時表示）はスマホの画面幅では成立しない
- モバイルは Misskey 公式の PWA 推奨思想に乗るか、Aria 等のネイティブクライアントを使えばよい
- Tauri のモバイル対応は制約が多く、デスクトップと挙動が異なるためサポートコストに見合わない
- ストア公開費用（Apple $99/年、Google $25）を開発リソースに回す

### なぜ NoteDeck か — フォーク対応

Misskey のフォーク（Sharkey・CherryPick・Firefish・Iceshrimp 等）はそれぞれ独自機能を持つが、
モバイルクライアントは本家 API にしか追従できず、フォーク独自機能を使うには結局 PWA に戻るしかない。

NoteDeck は adapter パターンでフォークごとの差異を吸収し、**どのフォークでも固有機能が使えるデスクトップクライアント**を目指す。
PWA の機能網羅性と、ネイティブアプリのデスクトップ体験（デッキ UI・キーボード操作・ローカル検索）を両立する。

## 設計原則

- Apple 式直感 UI: 設定項目を増やさず、触ればわかる操作で完結
- 機能網羅より体験品質: 少ない機能を心地よく使えることを優先
- Web UI へのリンク導線: 非対応機能はブラウザで開けるようにする

---

## 構造的に対応しない領域

低頻度・管理系の操作は Web UI の責務とし、実装しない。
**ただし、ユーザーが迷わず Web UI へ到達できるリンク導線を整備する。**

| 領域 | 理由 | リンク導線 |
|---|---|---|
| 管理画面 | サーバー管理は Web UI 固有の責務 | ✅ アカウントメニュー → Admin |
| プロフィール編集 | 年に数回の操作。Web UI リンクで十分 | ✅ プロフィールバナー → 編集ボタン |
| ドライブ管理 | ファイル整理は Web UI の仕事。投稿時アップロードのみ対応 | ✅ アカウントメニュー → Drive |
| リスト管理 | 作成・編集は Web UI で。カラム表示のみ対応 | ✅ アカウントメニュー → Lists / カラムヘッダー → 外部リンク |
| アンテナ管理 | 作成・編集は Web UI で。カラム表示のみ対応 | ✅ アカウントメニュー → Antennas / カラムヘッダー → 外部リンク |
| チャンネル管理 | 閲覧は対応。作成・編集は Web UI で | ✅ カラムヘッダー → 外部リンク |
| ミュート・ブロック | 安全管理は Web UI で一覧管理 | ✅ アカウントメニュー → Mute & Block |
| お知らせ | サーバーからの告知閲覧 | ✅ アカウントメニュー → Announcements |
| フォロー管理画面 | 一覧表示・整理は Web UI で。フォロー操作のみ対応 | ✅ プロフィール → Following / Followers |
| ページ管理 | 作成・編集は Web UI で。閲覧はページカラムで対応 | ✅ アカウントメニュー → Pages / カラムヘッダー → 外部リンク |
| ウィジェット | Web UI のダッシュボード機能。デッキ UI と設計思想が異なる | — |
| 設定画面の網羅 | Misskey 本家の膨大な設定項目は Apple 式の思想と矛盾 | ✅ アカウントメニュー → Settings |
| ノート詳細 | 会話チェーン等はアプリ内で表示。Web UI でも開ける | ✅ ノートメニュー → Web UIで開く |
| 他人のプロフィール | 閲覧はアプリ内。詳細操作は Web UI で | ✅ プロフィールバナー → 外部リンクボタン |

**判断基準**: 月 1 回以下の操作 / 作成・管理系 / Web UI リンクで代替可能

---

## Core: 基盤機能

Phase を横断する土台。デッキ UI・レンダリング・マルチアカウント・デスクトップ統合の基礎。

### デッキ UI

- [x] **カラム管理** — 追加・削除・並べ替え（ドラッグ＆ドロップ）、レイアウト localStorage 永続化
- [x] **カラムリサイズ** — ドラッグで 280px〜600px に自由変更、幅を localStorage に永続化
- [x] **ナビバー構造** — 折りたたみ/展開（68px↔250px）、ドラッグリサイズ、120px 以下で自動折りたたみ
- [x] **フローティングウィンドウ** — ノート詳細・ユーザープロフィール・ログインをウィンドウで表示。
  ドラッグ移動、最小化/最大化、Z-index 自動管理、同一対象の重複排除、サーバーテーマ反映
- [x] **カスタムタイトルバー** — 最小化/最大化/閉じる、サイドバー切替、モバイルサイズ切替
- [x] **カラムフィルター** — Renote 除外・リプライ除外・ファイル付きのみ・Bot 除外（timelineFilter）
- [x] **カラムサウンド** — カラム単位のミュート/アンミュート、通知サウンド再生
- [x] **デッキプロフィール** — 名前付きプリセット（「仕事用」「趣味用」等）でカラム構成を保存・切替。
  `Alt+1`〜`9` で即切替、コマンドパレットからも実行可能

### ナビバー機能

ナビバーの構造（折りたたみ/展開/リサイズ）は実装済みだが、中身はほぼ空。
**カラムで再現できる機能はナビバーに置かない。** カラムを超えた操作のみをナビバーに配置する。

#### 実装済み

- [x] **投稿ボタン** — 新規ノート作成（展開時テキスト付き / 折りたたみ時 FAB 化）
- [x] **アカウント管理** — アバター一覧、切替、モード設定、ログアウト、アカウント追加
- [x] **横断検索** — 全アカウントのキャッシュ＋サーバー検索を統合。
  単一アカウントの検索カラムでは不可能な、全アカウント横断の検索体験
- [x] **横断通知** — 全アカウントの通知を統合表示するウィンドウ
- [x] **テーマ切替** — ダーク / ライト手動切替トグル（太陽/月アイコン）

- [x] **接続状態インジケーター** — アカウントごとのストリーミング接続状態
  （接続中 / 再接続中 / 切断）をアイコンで表示
- [x] **設定** — ボトムバーの設定ボタンからアプリ設定メニューにアクセス
  （カスタムCSS・壁紙・テーマインストール等）

### レンダリング・表示

- [x] **MFM 完全レンダリング** — bold/italic/strike/code/mention/hashtag/URL/link/カスタム絵文字/
  Unicode 絵文字/コードブロック + アニメーション関数（spin/shake/bounce/jelly/tada/jump/twitch/
  rainbow/sparkle/blur/fontSize/color/bgColor/border 等）
- [x] **カスタム絵文字** — ホスト単位キャッシュ、`@.` リモート絵文字、並列フェッチ重複排除
- [x] **Twemoji** — Unicode 絵文字を自動変換、リアクション絵文字 URL 生成
- [x] **コードハイライト** — Shiki（Dark Plus テーマ）、17 言語対応
  （bash/c/cpp/css/go/html/java/js/json/kotlin/markdown/python/ruby/rust/sql/ts/yaml）
- [x] **OGP リンクプレビュー** — IntersectionObserver 遅延読み込み、Rust バックエンドでメタデータ抽出＆キャッシュ
- [x] **メディアグリッド** — 画像/動画/音声の表示（最大 4 ファイル）、NSFW 切替、ライトボックス、遅延読み込み
- [x] **投票表示** — 投票結果の表示、投票操作
- [x] **リアクション楽観的更新** — UI 即時反映＋失敗時ロールバック
- [x] **ユーザーホバープレビュー** — アバターホバー 400ms でユーザー情報ポップアップ表示
- [x] **リアクション者一覧** — リアクションホバーでリアクションしたユーザー一覧をポップアップ表示
- [x] **インスタンスティッカー** — リモートユーザーのサーバー favicon + テーマカラー表示

### テーマ

- [x] **Misskey 互換テーマコンパイラ** — Misskey テーマ定義を CSS 変数にコンパイル
- [x] **アカウント別テーマ** — サーバーのデフォルトテーマ（meta.themeDark / meta.themeLight）を自動取得、
  アカウント単位でカラム・ウィンドウに適用
- [x] **ダーク/ライト自動選択** — システム設定に連動
- [x] **テーマ手動切替** — ナビバーの太陽/月トグルでダーク/ライト切替
- [x] **テーマ JSON5 インストール** — Misskey テーマコードを貼り付けてインストール

### マルチアカウント

- [x] **複数サーバー同時接続** — SQLite 管理（UNIQUE(host, user_id) 制約）、サーバー単位のアカウント分類
- [x] **アカウント切替** — アカウントメニューから即座に切替
- [x] **サーバー情報キャッシュ** — TTL 24 時間、ソフトウェア検出、バージョン追跡、機能検出

### デスクトップ統合

- [x] **システムトレイ** — 常駐、トレイアイコン
- [x] **デスクトップ通知** — リアルタイム通知（ノート・リアクション・フォロー等）、
  アプリフォーカス中は非表示、通知アクション（クリックでノート/ユーザーを開く）
- [x] **自動アップデート** — Tauri updater で起動時チェック、ダウンロード＋インストール＋自動再起動
- [x] **自動起動** — tauri-plugin-autostart でOS起動時に自動起動

### パフォーマンス

- [x] **仮想スクロール** — vue-virtual-scroller（DynamicScroller）を全カラムで使用、最大 500 ノート
- [x] **3 層画像キャッシュ** — メモリ→ディスク→ネットワーク（Rust image_cache.rs）
- [x] **ストリーミングバッチ処理** — requestAnimationFrame バッファリング、forceUpdate 定期実行
- [x] **画像プロキシ** — `http://127.0.0.1:19820/proxy/image` 経由でキャッシュ付き配信

---

## Phase 1: 生存条件 — Web UI に戻らせない（カラム種別の拡充）

日常ループ（閲覧・反応・会話）を途切れさせない機能を揃える。
これが欠けると「結局 Web UI でいいや」になる。

- [x] タイムライン（HTL / LTL / STL / GTL / カスタム）
- [x] 通知カラム（リアルタイム、タイプ別アイコン・ラベル、ユーザーホバープレビュー）
- [x] 検索カラム（ローカル FTS5 + サーバー検索ハイブリッド、重複排除マージ）
- [x] 投稿（テキスト・CW・公開範囲・ファイル添付・投票・編集・ローカルオンリー・Ctrl+Enter 送信）
- [x] 下書き管理（localStorage、最大10件、アカウント別、保存・復元・削除UI）
- [x] リアクション / リプライ / リノート / 引用
- [x] フォロー / アンフォロー
- [x] リストカラム
- [x] アンテナカラム
- [x] ダイレクト投稿カラム（visibility: specified）
- [x] チャットカラム（Misskey v2025.2.0+ chat API、リアルタイム WS 対応）
- [x] クリップカラム
- [x] ユーザーノート一覧カラム
- [x] メンションカラム
- [x] チャンネルカラム
- [x] お気に入りカラム
- [x] ウィジェットカラム（AiScript Console / App 実行環境）
- [x] AiScript エディタカラム（独立カラム、上下分割レイアウト、Web Worker LSP）
- [ ] ページカラム（Misskey Pages の閲覧。MFM レンダリング基盤を流用）

---

## Phase 2: 唯一無二の価値 — デスクトップアプリだからこそ

Phase 1 で蓄積されたローカルキャッシュの上に、Web UI では原理的に不可能な機能を載せる。

- [x] **ローカル全文検索基盤** — SQLite FTS5（trigram トークナイザー）による日本語対応検索。
  ストリーミング受信・API 取得時にノートを自動キャッシュし、検索カラムで即座にローカル検索。
  サーバー検索との統合表示（重複排除・マージ）も実装済み
- [x] **キャッシュファースト表示** — 全カラムでローカルキャッシュを先読みし即座に表示。
  サーバーからは差分のみ取得（sinceId）。オフライン時もキャッシュ済み TL を表示継続
- [x] **横断検索** — 複数サーバー × 全カラムのノートを統合検索。
  全アカウントのローカルキャッシュ＋サーバー検索を並列実行し、結果をマージ表示。
  サーバー A のリスト + サーバー B のアンテナ + サーバー C の HTL をまたいだ検索は NoteDeck だけの体験

**Phase 2 完了** — SQLite FTS5 + キャッシュファースト表示 + 差分取得 + 横断検索が揃い、
ローカルファーストの検索体験が完成。

---

## Phase 3: Hackable — VSCode の世界観を Misskey に

NoteDeck を拡張可能にする 3 本柱。VSCode がエディタの世界で実現したモデルを、
Misskey エコシステムの言語（AiScript）とプロトコルで再構築する。

**3 つの柱が同じコマンドシステムに収斂する:**
- **人間** → コマンドパレットから実行
- **AI** → HTTP API から実行
- **AiScript プラグイン** → コマンドを登録・実行

### 柱 1: コマンドパレット（人間のインターフェース）

VSCode の Ctrl+Shift+P に相当。全操作がコマンドとして登録され、検索・実行できる。

- [x] コマンドパレット基盤（Ctrl+K で起動、fuzzy 検索）
- [x] ショートカットキー連携（コマンドにキーバインドを紐づけ）
- [x] **キーバインドカスタマイズ** — `useKeybindsStore` でデフォルト＋ユーザー上書きを管理。
  VSCode の `keybindings.json` と同じ思想。設定 UI からリマップ可能。
  カラム間移動・クイックリアクション等の全キーバインドを統合管理

### 柱 2: HTTP API（AI・外部ツールのインターフェース）

VSCode の Extension API + Language Server に相当。
Claude Code や AI エージェントが NoteDeck を操作できる外部 API。

- [x] HTTP サーバー基盤（localhost で起動）
- [x] **Bearer トークン認証** — 起動時にランダムトークンを生成しファイルに書き出し。
  Jupyter Notebook 方式で同一マシンの認可済みプロセスのみアクセス可能
- [x] **コマンド実行 API** — 登録済みコマンドを HTTP 経由で実行。
  コマンドパレットで人間ができることは全て API からもできる
- [x] **状態取得 API** — カラム一覧、アクティブカラム、ノート取得等の読み取り操作
- [x] **イベントストリーム** — SSE で状態変化を購読。
  AI が「新着通知があったら要約して」等のリアクティブ処理を実現

### 柱 3: AiScript プラグイン（Misskey ネイティブの拡張言語）

VSCode の TypeScript Extensions に相当するが、言語は **AiScript**。
Misskey ユーザーが既に馴染んでいるサンドボックス言語で、安全に拡張機能を書ける。

- [x] **AiScript ランタイム基盤** — @syuilo/aiscript v1.2.1 を WebView 内で実行。
  ウィジェットカラム（Console / App）および独立 AiScript エディタカラムで記述・実行可能。
  CodeMirror 6 エディタ統合（VS Code Dark+ テーマ、行番号、横スクロール、Web Worker LSP による補完・診断）
- [x] **Misskey Play 互換 API** — `Mk:dialog`, `Mk:confirm`, `Mk:toast`, `Mk:api`, `Mk:save`, `Mk:load`,
  `Mk:remove`, `Ui:render`, `Ui:get`, `Ui:root`, `Ui:C:*`（text/mfm/button/buttons/textInput/textarea/numberInput/
  switch/select/container/folder/postFormButton/postForm/spacer）。
  `Mk:dialog`/`Mk:confirm`/`Mk:toast` は専用 Vue コンポーネント（AiScriptDialog/AiScriptToast）で表示
- [x] **Misskey Plugin API 互換** — Misskey 本家の全 Plugin API を実装:
  `Plugin:register_note_action`, `Plugin:register_user_action`,
  `Plugin:register_post_form_action`, `Plugin:register_note_view_interruptor`,
  `Plugin:register_note_post_interruptor`, `Plugin:open_url`, `Plugin:config`。
  コロン区切りエイリアス（`Plugin:register:*`）にも後方互換対応。
  レガシー AiScript（v0.13.2 / v0.19.0）のプラグインにも対応
- [ ] **Misskey 本家 API 互換性ギャップ** — 以下の API は未対応:
  - `Plugin:register_page_view_interruptor` — ページビューの書き換えフック。ページカラム実装時に対応予定
- [x] **プラグイン管理 UI** — インストール・有効/無効切替・アンインストール。
  Misskey 本家と同じくテキストベースでコピペインストール、AiScript エディタによるシンタックスハイライト
- [x] **NoteDeck 拡張 API** — Misskey 本家にない NoteDeck 固有の拡張ポイント。
  名前空間は `Nd:*` に統一し、Misskey 本家の `Mk:*` / `Plugin:*` との衝突を回避。
  フィーチャーディテクション用の定数で、プラグインが実行環境を判別できる。
  AiScript カラム・Play カラム・ウィジェット・プラグインの全実行ポイントに統合済み
  - `NOTEDECK` — bool 定数。`exists("NOTEDECK")` でフィーチャーゲート可能
  - `Nd:version` — NoteDeck のバージョン文字列
  - `Nd:register_command` — コマンドパレットにカスタムコマンドを登録（ライフサイクル管理付き）
  - `Nd:columns` / `Nd:addColumn` / `Nd:removeColumn` — カラム操作 API（型バリデーション付き）

**なぜ AiScript か:**
- **安全** — サンドボックス実行。ファイルシステム・ネットワークへの直接アクセスなし
- **既存文化** — Misskey ユーザーは Plugin / Play で AiScript に馴染んでいる
- **互換性** — Misskey 本家のプラグインを（API 互換の範囲で）そのまま動かせる可能性
- **配布が容易** — テキストベースでコピペ共有可能。Misskey 本家と同じインストール体験

---

## Phase 4: notecli — ヘッドレス Misskey クライアントの分離

NoteDeck の Rust バックエンドから Tauri 非依存のコードを **notecli** として別プロジェクトに切り出す。
CLI / デーモンモードで動作し、GUI 環境なしで AI エージェント（Claude Code, OpenClaw 等）から
Misskey を操作できるようにする。

**notecli は NoteDeck 固有ではなく、汎用 Misskey CLI ツール。**
NoteDeck は notecli をライブラリとして利用する形になる。

### ライブラリ分離（完了）

notecli は既に独立リポジトリ（`github.com/hitalin/notecli`）として分離済み。
NoteDeck は `Cargo.toml` で git 依存として参照している。

- [x] **API クライアント** — Misskey HTTP API ラッパー（api.rs）
- [x] **SQLite データベース** — ノートキャッシュ・FTS5 検索・アカウント管理（db.rs）
- [x] **データモデル** — Misskey エンティティの型定義（models.rs）
- [x] **エラー型** — 統一エラーハンドリング（error.rs）
- [x] **イベントバス** — tokio broadcast ベースの pub/sub（event_bus.rs）

### NoteDeck に残っているもの（Tauri 固有）

| ファイル | 役割 | 行数 |
|---------|------|------|
| `lib.rs` | Tauri 初期化・プラグイン・システムトレイ | 256 |
| `commands.rs` | `#[tauri::command]` IPC ハンドラ（notecli を呼び出し） | 1247 |
| `streaming.rs` | TauriEmitter アダプタ（notecli の FrontendEmitter trait 実装） | 21 |
| `http_server.rs` | Axum HTTP API サーバー（localhost:19820） | 643 |
| `image_cache.rs` | 3 層イメージキャッシュ（メモリ→ディスク→ネットワーク） | 358 |
| `ogp.rs` | OGP メタデータ抽出＆キャッシュ | 188 |
| `query_bridge.rs` | HTTP API ↔ フロントエンド（Pinia）ブリッジ | 44 |

### 残タスク

- [x] **streaming.rs の notecli 移行** — `AppHandle.emit()` を `FrontendEmitter` trait に抽象化。
  WebSocket 接続管理を notecli 側に移動し、notedeck 側は薄い TauriEmitter アダプタ（22行）のみ
- [x] **CLI モード** — notecli 単体での CLI 実行（投稿・検索・TL 取得等）。
  clap ベースのサブコマンド: `accounts`, `post`, `tl`, `search`, `notifications`, `note`, `delete`。
  `--json` フラグで AI エージェント向けマシンリーダブル出力
- [x] **デーモンモード** — バックグラウンドでストリーミング接続を維持し、HTTP API + SSE で配信。
  `EventBusEmitter` により WebSocket → EventBus → SSE のパイプラインが完結

---

## Phase 5: 廃人モード — キーボードだけで完結する世界

Misskey パワーユーザー（いわゆる廃人）がブラウザを捨てて NoteDeck に住み着くための機能群。
「マウスに手を伸ばした時点で負け」の世界観。

### 5-1. Vim モード / キーボード操作

キーボードだけで TL 閲覧・リアクション・投稿・移動すべてを完結させる。

**実装済みの基礎:**
`useNoteFocus` composable + コマンドシステムで以下が動作中:
`j`/`k` ノート移動、`e`/`+` リアクション、`r` リプライ、`q` リノート/引用、
`b` ブックマーク、`v` CW トグル、`Enter` ノート展開、`p`/`n` 新規投稿、`a` アカウントメニュー

- [x] **基本ノートナビゲーション** — `j` / `k` でノート移動、`Enter` で詳細展開（useNoteFocus）
- [x] **ノートアクション** — `r` リプライ、`e`/`+` リアクション、`q` リノート/引用、`b` ブックマーク、`v` CW トグル
- [x] **カラム間移動** — `H` / `L` でカラム切替、`Ctrl+1`〜`9` でカラム直接選択。
  キーバインドカスタマイズで変更可能
- [x] **クイックリアクションキー** — `1`〜`9` でお気に入りリアクション（pinnedReactions）を即送信。
  ノートにフォーカスした状態で数字キー一発。キーバインドカスタマイズで変更可能

### 5-2. コマンドパレット中枢化

Phase 3 のコマンドパレットを「すべての起点」に昇格させる。

**実装済みの基礎:**
コマンドレジストリ・fuzzy 検索・カテゴリ分類・ショートカット連携は動作中。
現在 13 コマンド登録（compose, note-next/prev/reply/react/renote/bookmark/open/cw 等）。
notecli 互換 CLI モード（`post`/`search`/`tl`/`notifications`/`note`/`delete`/`accounts`）で
パレットから直接コマンド入力・実行可能。

- [x] **投稿コマンド** — コマンドパレットから直接投稿。`post ここに本文` で即送信
- [x] **クイックリアクション** — `1`〜`9` キーでフォーカス中のノートにピン留めリアクションを即送信。
  コマンドパレットからも `note-react` で実行可能

### 5-3. グローバルホットキー / Quick Note

OS レベルのショートカットで、NoteDeck 非アクティブ時でも即座にアクションを実行。

**実装済みの基礎:**
`tauri-plugin-global-shortcut` プラグインが初期化済み。
`Ctrl+Shift+N` が global scope で新規投稿にバインド済み。

- [x] **グローバルホットキー基盤** — Tauri global-shortcut プラグイン初期化済み、
  `Ctrl+Shift+N` で新規投稿（アプリ非アクティブ時も動作）
- [x] **Quick Note** — `Ctrl+Alt+N` でコマンドパレットを `post` モードで起動。
  テキスト入力 → Enter で即送信、パレットは自動で閉じる
- [x] **Boss Key** — `Ctrl+Shift+B` で即座にウィンドウを非表示。
  上司が来た時に一瞬で消す（タスクバーからも消える）

### 5-4. ローカルファースト Misskey

思想：**Misskey = UI、あなたの DB = 本体**。
TL はローカル DB から読み、サーバーは同期元として扱う。

**実装済みの基礎:**
SQLite FTS5（trigram）でローカル全文検索が動作中。ノートは全カラム種別で無期限自動キャッシュ。
キャッシュファースト表示 + sinceId 差分取得で、オフライン時もキャッシュ済み TL を表示継続。

- [x] **ローカル全文検索** — SQLite FTS5 trigram トークナイザーで日本語対応。
  検索カラムで入力中に即座にローカル結果を表示、Enter でサーバー検索結果とマージ
- [x] **キャッシュファースト TL** — 全カラムで SQLite キャッシュを先読み表示。
  ネットワーク障害時もキャッシュがあればエラーを出さず表示継続
- [x] **ノートキャッシュ永久保存** — `cleanup_cache()` を no-op 化し無期限保存。
  サーバーからノートが消えてもローカルに残る
- [x] **TL 履歴タイムマシン** — 日付指定で過去の TL を再現。
  時計ボタンから日付選択、キャッシュ済みノートを閲覧、Live ボタンで復帰

### 5-5. 高度なフィルタリング

**実装済みの基礎:**
`timelineFilter.ts` で基本フィルター動作中（Renote 除外、リプライ除外、ファイル付きのみ、Bot 除外）。
通知カラムでタイプ別のアイコン・ラベル表示。デスクトップ通知 + サウンド再生。

- [x] **基本フィルター** — Boolean フィルター（withRenotes/withReplies/withFiles/withBots）をカラム設定から制御
- [x] **デスクトップ通知** — リアルタイム通知送信、アプリフォーカス中は自動抑制、5 分間の通知コンテキスト保持
- [x] **通知サウンド** — AudioContext デコード＋キャッシュ、カラム単位ミュート、フェードイン再生
- [x] **正規表現検索** — 検索カラム・横断検索で正規表現パターンによる検索が可能。
  `.*` トグルで正規表現モードに切替、ローカル/サーバー検索結果をクライアント側で正規表現ポストフィルタ。
  構造化フィルタビルダー（いずれかを含む/すべてを含む/除外する）で直感的に条件構築

### 5-6. クロスサーバー連携

- [x] **クロスサーバー検索** — 複数サーバーの API 検索結果を統合表示。
  ローカル検索 + API 検索のハイブリッド（横断検索ウィンドウで実装済み）

---

## Phase 6: AI Agent Host — Misskey 版 VSCode + Copilot

NoteDeck を AI エージェントの実行環境にする。
VSCode が Claude Code / GitHub Copilot / OpenClaw のホストになったように、
NoteDeck が Misskey エコシステムにおける AI エージェントのホストになる。

**既存の土台:**
Phase 3 で HTTP API + SSE + コマンドシステムが完成済み。
人間がコマンドパレットでできることは、全て API 経由で AI にもできる。

```
VSCode                          NoteDeck
─────────────────────────────────────────────
エディタ                         デッキ UI
Extensions (TypeScript)          Plugins (AiScript)
Command Palette (Ctrl+Shift+P)   Command Palette (Ctrl+K)
keybindings.json                 keybindings store
Language Server Protocol         HTTP API + SSE
─────────────────────────────────────────────
GitHub Copilot / Claude Code     → Phase 6 で埋める
```

### 6-1. AI パネル（Copilot Chat 相当）

- [ ] **AI チャットカラム** — サイドパネルまたはカラムとして AI チャットを配置
- [ ] **ローカル DB コンテキスト** — 全ノートを文脈として渡せる（Web サービスには不可能な量）
- [ ] **自然言語クエリ** — 「今日の TL まとめて」「この人との過去のやり取り見せて」

### 6-2. Agent プロトコル

AI エージェントが NoteDeck に接続して常駐するための標準プロトコル。
既存の HTTP API + SSE をエージェント向けに拡張する。

- [ ] **エージェント登録 API** — エージェントが自身を NoteDeck に登録し、ステータスを通知
- [ ] **権限モデル** — エージェントごとの権限管理（「投稿 OK・フォローは確認」等）
- [ ] **OpenClaw / Claude Code 対応** — 外部 AI エージェントが `localhost:19820` に接続して常駐

### 6-3. AI × AiScript — 自己拡張するアプリ

AI が AiScript プラグインを生成し、NoteDeck 自身を拡張する。
AiScript はサンドボックスなので、AI が書いたコードも安全にインストールできる。

```
ユーザー: 「特定キーワードの通知だけフィルターして」
    ↓
AI Agent: AiScript プラグインを生成
    ↓
NoteDeck: プラグインをインストール・実行
    ↓
AI Agent: 動作を SSE で監視 → 改善提案
    ↓
ユーザー: 「条件もう少し緩くして」
    ↓
AI Agent: プラグインを書き換え → 再インストール
```

- [ ] **プラグイン生成 API** — AI がプラグインコードを生成し、HTTP API 経由でインストール
- [ ] **プラグイン動作監視** — AI がプラグインの実行結果を SSE で監視し、自動チューニング
- [ ] **自然言語 → AiScript** — 「○○するプラグイン作って」で AI がコード生成・インストールまで完結

### 6-4. AI 連携ユースケース

常駐アプリ + ローカル DB + API の三位一体で初めて成立する機能群。

- [ ] **離席サマリー** — 離れていた間の TL を AI が要約して表示
- [ ] **通知トリアージ** — AI が通知を重要度分類し、重要なものだけデスクトップ通知
- [ ] **TL 翻訳** — 海外サーバーの TL をリアルタイム翻訳してカラムに流す

---

## フォーク adapter 対応状況

NoteDeck のコアバリュー「どのフォークでも固有機能が使える」の実体化。

| フォーク | 状態 | 対応する固有機能 |
|---|---|---|
| Misskey 本家 | 基本対応済み | Chat API (v2025.2.0+) 含む |
| Sharkey | 未着手 | — |
| CherryPick | 未着手 | — |
| Firefish | 未着手 | — |
| Iceshrimp | 未着手 | — |

---

## 将来の検討材料

優先度は低いが、技術的に興味深い方向性。

| 項目 | 状態 | メモ |
|---|---|---|
| AiScript エディタ | **実装済み** | CodeMirror 6 統合（VS Code Dark+ テーマ・Web Worker LSP 補完/診断・行番号・横スクロール）。ウィジェットカラム + 独立 AiScript エディタカラム（上下分割・リサイズ可能・Ui:render プレビュー・コンソール出力）で利用可能 |
| AiScript Play 実行 | **実装済み** | Mk:api / Ui:render / レガシー AiScript 対応。Play カラムで実行可能 |
