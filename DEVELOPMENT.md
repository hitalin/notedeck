# NoteDeck Development Guide

Multi-server Misskey deck client with fork support. 設計思想・方針は [DESIGN.md](DESIGN.md) を参照。

## Tech Stack

| | |
|---|---|
| Frontend | Vue 3 + TypeScript（Vapor モード移行予定） |
| Backend | Rust (Tauri v2) + [notecli](https://github.com/hitalin/notecli) |
| Build | Vite 8 (Rolldown) + Cargo |
| State | Pinia |
| Local DB | SQLite (rusqlite, WAL mode, FTS5) |
| HTTP | reqwest (Rust, via notecli) |
| WebSocket | tokio-tungstenite (Rust, via notecli) |
| HTTP API | Axum (localhost:19820) |
| Script | AiScript (@syuilo/aiscript) |
| Editor | CodeMirror 6 |
| Linter | Biome |
| Style | SCSS + CSS Modules (`$style`) |
| Test | Vitest + happy-dom |

## Prerequisites

| ツール | インストール |
|--------|-------------|
| [Node.js](https://nodejs.org/) (LTS) | 公式サイト or `nvm install --lts` |
| [pnpm](https://pnpm.io/) | `corepack enable && corepack prepare pnpm@latest --activate` |
| [Rust](https://www.rust-lang.org/) (stable) | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| [Task](https://taskfile.dev/) | `sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin` |

**Linux のみ**: Tauri のビルドに追加パッケージが必要です。

```bash
# Ubuntu / Debian
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server (Tauri desktop)
task dev:tauri

# Start dev server (browser, for development only)
task dev
```

## Available Tasks

```bash
task dev          # Vite dev server
task dev:tauri    # Tauri dev
task build        # Production build
task build:tauri  # Tauri native build
task test         # Run unit tests
task test:watch   # Run tests in watch mode
task lint         # Lint & format check
task lint:fix     # Lint & format fix
task typecheck    # TypeScript type check
task clean        # Remove build artifacts
```

### テスト構成

テストは 2 プロジェクトに分離（`vitest.config.ts`）:

| プロジェクト | 環境 | ファイルパターン | 用途 |
|------------|------|----------------|------|
| `unit` | Node.js | `*.test.ts` | ロジック・ユーティリティ |
| `dom` | happy-dom | `*.dom.test.ts` | Vue コンポーネント・DOM 操作 |

## Architecture

NoteDeck は **notecli** と **notedeck** の 2 リポジトリで構成されています。

### notecli ([github.com/hitalin/notecli](https://github.com/hitalin/notecli))

Tauri に依存しない Misskey ヘッドレスクライアント。Rust ライブラリ兼 CLI デーモン。

- Misskey HTTP API クライアント、WebSocket ストリーミング、SQLite DB、REST API サーバー
- 単体で `localhost:19820` の HTTP API デーモンとして動作（GUI 不要）
- NoteDeck の Rust バックエンドとして `Cargo.toml` の git 依存で利用される

### notedeck (このリポジトリ)

notecli の上に Tauri v2 + Vue 3 の GUI を載せたクライアント。
対象プラットフォームは Windows / macOS / Linux / Android。

```
src/                        # Vue 3 frontend
├── adapters/               # Server API adapters (Misskey, forks)
│   ├── types.ts            # Shared interfaces (ServerAdapter, ApiAdapter, StreamAdapter)
│   ├── registry.ts         # Adapter factory
│   └── misskey/            # Misskey implementation (IPC via invoke/listen)
├── aiscript/               # AiScript runtime & Misskey Play API
├── commands/               # Command registry, definitions, CLI handlers
├── components/             # Vue components
│   ├── common/             # MkNote, MkPostForm, MkEmoji, CommandPalette, etc.
│   └── deck/               # DeckLayout, DeckColumn, column types
├── composables/            # Vue composables (useNoteFocus, useTimeMachine, etc.)
├── core/                   # Business logic (server detection)
├── data/                   # Static data & constants
├── router/                 # Vue Router definitions
├── stores/                 # Pinia stores (accounts, deck, servers, emojis, theme, etc.)
├── styles/                 # Global CSS (CSS variables)
├── theme/                  # Misskey-compatible theme compiler & applier
├── utils/                  # Shared utilities
└── views/                  # Page components (NoteDetail, UserProfile)

src-tauri/src/              # Rust backend (Tauri 固有部分)
├── lib.rs                  # App setup (tray, plugins, state)
├── commands.rs             # Tauri IPC command handlers (notecli 呼び出し)
├── http_server.rs          # Axum HTTP API server (localhost:19820)
├── image_cache.rs          # 3-tier image cache (memory → disk → network)
├── ogp/                    # OGP metadata extraction & cache
├── streaming.rs            # TauriEmitter adapter (FrontendEmitter trait impl)
├── query_bridge.rs         # HTTP API ↔ frontend (Pinia) bridge
└── main.rs                 # Entry point
```

Misskey API クライアント・DB・モデル・ストリーミングコアなどの共通ロジックは全て `notecli` クレートにあり、`src-tauri/` には Tauri 固有の薄いラッパーのみ残っています。

### Multi-Window & Profile Architecture

ウィンドウとプロファイルは**直交する概念**です。

- **プロファイル**: カラム構成・レイアウトの保存単位。データの所有者
- **ウィンドウ**: プロファイルの表示先。同じプロファイルを複数ウィンドウで開ける

```
Profile A ──→ Main Window（windowId なしのカラムを表示）
         └──→ Sub Window 1（windowId = "w1" のカラムを表示）

Profile B ──→ Main Window（プロファイル切り替え時）
```

**設計原則:**

1. プロファイルが変更されたら、そのプロファイルを開いている**全ウィンドウ**がリアクティブに追従する
2. 各ウィンドウは `windowLayout`（computed）で自分に属するカラムだけをフィルタして表示する
3. ウィンドウの作成・破棄はプロファイルのデータに影響しない

**同期方式:** localStorage（全 webview 共有）を SSoT とし、Tauri イベント（`deck:profile-updated`）でキャッシュ無効化を通知。Rust 側に SSoT を移す案も検討したが、localStorage が既に全 webview で共有されており、本質的に同じ構造になるため不採用（[PR #172](https://github.com/hitalin/notedeck/pull/172) で議論）。

### Window / Column Model（[#194](https://github.com/hitalin/notedeck/issues/194)）

ウィンドウとカラムは「ストリーム / 詳細 / ツール」の3分類で役割を分担する。

| 分類 | UI | 用途 | 永続性 |
|------|-----|------|--------|
| **ストリーム** | カラム | 継続的なデータフィード（TL、通知、検索、チャット等） | プロファイルに永続化 |
| **詳細** | ウィンドウ | 特定アイテムの一時的な表示（ノート詳細、プロフィール、フォローリスト） | セッション限り |
| **ツール** | ウィンドウ | アプリ設定・管理（ログイン、エディタ群、プラグイン、about） | セッション限り |

**Cross-account カラム:**

ストリーム系カラムは `accountId` で動作モードが決まる。

- `accountId: "user-xxx"` → **per-account**（`useColumnSetup` で単一アダプタ）
- `accountId: null` → **cross-account**（`useMultiAccountAdapters` で全アカウント並列取得）

対応済みカラム: 通知、検索、チャット、メンション、ダイレクト、フォローリクエスト。

**ナビバー（VSCode Activity Bar 式）:**

左ナビバーのアイコンはカラムの**トグルボタン**として機能する。クリックでサイドバーカラムを左端（`layout[0]`）に挿入、再クリックで削除。同時に1スロットのみ（`sidebar: true` フラグで管理）。

ナビバーのボタン構成はカスタマイズ可能（設定 → ナビバー）。`NavItem = { type, accountId } | { type: 'divider' }` 構造体でプロファイルに永続化される。

**共通コンポーネント:**

| コンポーネント | 用途 | 使用箇所 |
|-------------|------|---------|
| `ColumnBadges` | サーバー/アカウントバッジ表示 | DeckNavbar, DeckBottomBar, DeckMobileNav |
| `AvatarStack` | cross-account 時のアカウントアバター重ね表示 | AddColumnDialog, カラムヘッダー |
| `EditorTabs` | ビジュアル/コード 2タブ切替 | 全エディタ系ウィンドウ共通 |

**共通 composable:**

| composable | 用途 | 使用箇所 |
|-----------|------|---------|
| `usePointerReorder` | Pointer イベントによるドラッグ&ドロップ並び替え（軸指定対応） | NavEditorContent, ProfileEditorContent |
| `useCrossAccountNotes` | 複数アカウントからのノート並列取得・統合・重複排除 | DeckMentionsColumn, DeckSpecifiedColumn |

**アイコン・ラベルの一元定義:**

`useColumnTabs.ts` の `COLUMN_ICONS` / `COLUMN_LABELS` がカラムタイプのアイコンとラベルの SSoT。ナビバー、ボトムバー、エディタすべてがこれを参照する。

### Vue Vapor モード移行準備（[#52](https://github.com/hitalin/notedeck/issues/52)）

Vue 3.6 の Vapor モード（仮想DOMレス・コンパイル時DOM操作）への移行を予定。

**コーディング制約（Vapor 互換性維持）:**

- `<script setup>` 必須 — Options API / `export default {}` 禁止
- `h()` / JSX 禁止 — テンプレート構文のみ使用
- カスタムディレクティブ禁止 — composable で代替
- mixins / extends 禁止 — composable で代替
- `getCurrentInstance()` 禁止 — provide/inject または composable で代替
- `app.config.globalProperties` 禁止 — provide/inject で代替

**`<Transition>` / `<TransitionGroup>` 完全除去済み:**

全22箇所を `useVaporTransition` / `useVaporTransitionSwitch` / `useVaporTransitionGroup` composable + CSS `@keyframes` に移行済み。残る Vapor 非互換は `<Teleport>`（41箇所）のみ。

### Styling

コンポーネントのスタイリングには **CSS Modules + SCSS** を使用しています。

```vue
<template>
  <div :class="$style.container">...</div>
</template>

<style module lang="scss">
.container {
  display: flex;
}
</style>
```

- `<style module lang="scss">` で CSS Modules として定義し、テンプレートから `$style.xxx` で参照
- `vite.config.ts` で `localsConvention: 'camelCaseOnly'` を設定済み（`kebab-case` → `camelCase` 自動変換）
- グローバルな CSS 変数は `src/styles/global.css` で定義
- モバイル/デスクトップの切り替えは CSS の `display` ではなく `v-if` で制御

### キーボード操作（アクセシビリティ）

すべての UI 操作がキーボードだけで完結できることを目標とする。以下の composable を利用する。

#### `useFocusTrap(containerRef, options?)`

ダイアログ・モーダル・ポップアップで **Tab をコンテナ内にトラップ** + **Esc で閉じる** + **初期フォーカス設定**。

```ts
const dialogRef = ref<HTMLElement | null>(null)
const { activate, deactivate } = useFocusTrap(dialogRef, {
  initialFocus: 'button.primary', // CSSセレクタ（省略時は最初のfocusable要素）
  onEscape: () => close(),
})

// ダイアログ表示時: nextTick(activate)
// ダイアログ非表示時: deactivate()
```

**適用済み**: `AppConfirm`, `AddColumnDialog`, `NoteReactionPickerPopup`

#### `useMenuKeyboard(options)`

メニュー・ポップアップで **Arrow Up/Down ナビ** + **Home/End** + **Enter 選択** + **Esc 閉じ**。

```ts
const menuRef = ref<HTMLElement | null>(null)
const { activate, deactivate } = useMenuKeyboard({
  containerRef: menuRef,
  itemSelector: 'button',  // ナビ対象のCSSセレクタ
  onClose: () => close(),
})
```

**適用済み**: `PopupMenu`（NoteMoreMenu 等の全派生に波及）, `DeckSettingsMenu`, `DeckProfileMenu`, `NavAccountMenu`

#### 新規コンポーネント作成時のルール

- **ダイアログ/モーダル** → `useFocusTrap` を適用（Esc 閉じ + Tab トラップ必須）
- **ポップアップメニュー** → `PopupMenu` を使えば自動対応。手動メニューは `useMenuKeyboard` を適用
- **クリック専用の `<div>`** → `tabindex="0"` + `@keydown.enter` を追加してキーボードから操作可能にする
- **新機能** → コマンドパレット（`src/commands/definitions.ts`）へのコマンド登録を検討

### AI 設定

NoteDeck にはローカル LLM / OpenAI 互換 API を使った AI 機能がある。

| ファイル | 役割 |
|---------|------|
| `src/components/window/AiSettingsContent.vue` | AI 設定ウィンドウ（プロバイダー選択・プロンプト編集） |
| `src/defaults/AI.md` | デフォルトシステムプロンプト（syuilo/ai ベース） |
| `src/utils/settingsFs.ts` | Tauri ファイル I/O（`ai.json` 等の読み書き） |

**永続化:**
- 設定はファイル（`ai.json`）+ localStorage の二層保存
- **API キーはファイルに含めない**（localStorage のみ保存、セキュリティ対策）
- ファイルはバックアップ・エクスポート対象

**対応プロバイダー:** Ollama / OpenAI / カスタム OpenAI 互換エンドポイント

### パフォーマンス設定

NoteDeck のパフォーマンス関連パラメータはすべてユーザーが調整可能。設定エディタ UI とプリセット、ファイルベースのバックアップに対応している。

| ファイル | 役割 |
|---------|------|
| `src/stores/performance.ts` | Pinia ストア（`PerformanceConfig` 型定義・プリセット・Rust 同期） |
| `src/components/window/PerformanceEditorContent.vue` | 設定エディタ UI |
| `src/defaults/performance.json` | デフォルト値（「バランス」プリセット相当） |
| `src/utils/settingsFs.ts` | Tauri ファイル I/O（`performance.json` 読み書き） |

**カテゴリ:** 絵文字キャッシュ / ノート / パースキャッシュ / リアルタイム / バックエンド（Rust）

**プリセット:**

| プリセット | 想定用途 |
|-----------|---------|
| 省メモリ | 低スペック端末・メモリ節約 |
| バランス | デフォルト（`defaults/performance.json` と同値） |
| 高パフォーマンス | ハイエンド端末・大量カラム運用 |

**永続化:**
- 設定はファイル（`performance.json`）+ localStorage の二層保存
- デフォルト値と同じキーはオーバーライドに含めない（差分のみ保存）
- ファイルはバックアップ・エクスポート対象
- バックエンド（Rust）側のパラメータは `invoke('update_performance_config')` で即時同期

### Build

Vite 8 (Rolldown + OXC ベース) を使用。`vite.config.ts` で以下のカスタムプラグインを定義：

- **stripUnusedFonts** — 未使用フォント形式（woff, ttf）をビルドから除外
- **subsetTablerIcons** — ソースコードから使用中のアイコンを検出し、CSS ルールとフォントをサブセット化

### Guest Mode & Logout Fallback

NoteDeck はトークンを持たないユーザーでも公開タイムラインを閲覧できます。

#### ゲストモードとログアウト済みアカウント

| | ゲスト | ログアウト済み |
|---|---|---|
| **userId** | `__guest__`（固定値） | 正規のユーザー ID |
| **hasToken** | `false` | `false` |
| **カラム・設定** | 一時的 | 保持される |
| **UI** | 操作ボタンをグレーアウト | 赤い「ログアウト中」バナー + 再ログイン促進 |

#### Rust バックエンド（`src-tauri/src/commands.rs`）

- **`get_credentials_or_anon()`** — トークンがあればそのまま、なければ `(host, "")` を返す。notecli が空トークンを検知して公開 API を呼び出す
- **`create_guest_account()`** — `userId = "__guest__"`, `token = ""` のアカウントを DB に作成
- **`logout_account()`** — トークンのみ削除し、アカウント記録と設定は保持

公開 API 対応のコマンドは `get_credentials_or_anon()` を使用し、認証必須のコマンド（投稿・リアクションなど）は従来通り `get_credentials()` を使用します。

#### フロントエンド

| ファイル | 役割 |
|---------|------|
| `src/stores/accounts.ts` | `GUEST_USER_ID`, `isGuestAccount()` |
| `src/composables/useAccountMode.ts` | `isGuest`, `canInteract` computed |
| `src/utils/loginPrompt.ts` | `showLoginPrompt()` — ログイン促進トースト |

ゲスト / ログアウト時の操作ボタン（リアクション・リプライ・リノート）は disabled になり、クリックすると `showLoginPrompt()` でログイン促進トーストを表示します。

#### 新しい API コマンドを追加するとき

- **公開 API**（認証不要）→ `get_credentials_or_anon()` を使う
- **認証必須 API** → `get_credentials()` を使う

### Adding support for a new fork

NoteDeck は adapter パターンでフォークごとの差異を吸収しています。
ほとんどの Misskey フォークは基本アダプターのままで動作しますが、固有機能を活かすには以下の手順で対応を追加できます。

#### 最小構成（Misskey 互換フォーク）

フォークが Misskey API と完全互換なら、検出ロジックとレジストリの追加だけで済みます。

**1. サーバー検出に追加** — `src/core/server.ts`

```typescript
// detectSoftware() 内に追加
if (n === 'yourfork') return 'yourfork'
```

**2. 型定義に追加** — `src/adapters/types.ts`

```typescript
export type ServerSoftware =
  | 'misskey'
  | 'yourfork'  // 追加
  | ...
```

**3. レジストリに登録** — `src/adapters/registry.ts`

```typescript
// Misskey アダプターをそのまま再利用
registerAdapter('yourfork', createMisskeyAdapter)
```

#### 固有機能がある場合

フォーク固有の API やフィルターがある場合は、差分だけをオーバーライドします。

**フィルターの追加** — `src/adapters/types.ts`

```typescript
export const FORK_EXTRA_FILTERS: Partial<
  Record<ServerSoftware, (keyof TimelineFilter)[]>
> = {
  yourfork: ['withBots', 'withSensitive'],
}
```

**API アダプターのオーバーライド** — `src/adapters/yourfork/index.ts`

Misskey アダプターを継承し、差分のみ実装します。
API の実処理は Rust 側（notecli）にあるため、TypeScript 側は薄いブリッジです。

#### チェックリスト

- [ ] `src/core/server.ts` — `detectSoftware()` に追加
- [ ] `src/adapters/types.ts` — `ServerSoftware` に追加
- [ ] `src/adapters/types.ts` — `FORK_EXTRA_FILTERS` に追加（必要なら）
- [ ] `src/adapters/registry.ts` — `registerAdapter()` で登録
- [ ] `src/adapters/<fork>/` — 差分があればアダプター作成

## License

[AGPL-3.0](LICENSE)
