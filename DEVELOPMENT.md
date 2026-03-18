# NoteDeck Development Guide

Multi-server Misskey deck client with fork support.

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
| Test | Vitest + jsdom |

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

### Vue Vapor モード移行準備（[#52](https://github.com/hitalin/notedeck/issues/52)）

Vue 3.6 の Vapor モード（仮想DOMレス・コンパイル時DOM操作）への移行を予定。
現在のコンポーネントは **100% 互換**（全96コンポーネント確認済み）。

**コーディング制約（Vapor 互換性維持）:**

- `<script setup>` 必須 — Options API / `export default {}` 禁止
- `h()` / JSX 禁止 — テンプレート構文のみ使用
- カスタムディレクティブ禁止 — composable で代替
- mixins / extends 禁止 — composable で代替
- `getCurrentInstance()` 禁止 — provide/inject または composable で代替
- `app.config.globalProperties` 禁止 — provide/inject で代替

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

### Build

Vite 8 (Rolldown + OXC ベース) を使用。`vite.config.ts` で以下のカスタムプラグインを定義：

- **stripUnusedFonts** — 未使用フォント形式（woff, ttf）をビルドから除外
- **subsetTablerIcons** — ソースコードから使用中のアイコンを検出し、CSS ルールとフォントをサブセット化

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
