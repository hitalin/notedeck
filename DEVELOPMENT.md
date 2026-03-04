# NoteDeck Development Guide

Desktop-only multi-server Misskey deck client with fork support.

## Tech Stack

| | |
|---|---|
| Frontend | Vue 3 + TypeScript |
| Backend | Rust (Tauri v2) + [notecli](https://github.com/hitalin/notecli) |
| Build | Vite + Cargo |
| State | Pinia |
| Local DB | SQLite (rusqlite, WAL mode, FTS5) |
| HTTP | reqwest (Rust, via notecli) |
| WebSocket | tokio-tungstenite (Rust, via notecli) |
| HTTP API | Axum (localhost:19820) |
| Script | AiScript (@syuilo/aiscript) |
| Editor | CodeMirror 6 |
| Linter | Biome |
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

notecli の上に Tauri v2 + Vue 3 の GUI を載せたデスクトップ専用クライアント。
対象プラットフォームは Windows / macOS / Linux のみ。モバイルはサポートしない。

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
│   └── deck/               # DeckLayout, DeckColumn, 14 column types
├── composables/            # Vue composables (useNoteFocus, useTimeMachine, etc.)
├── core/                   # Business logic (server detection)
├── data/                   # Static data & constants
├── router/                 # Vue Router definitions
├── stores/                 # Pinia stores (accounts, deck, servers, emojis, theme, etc.)
├── styles/                 # Global CSS
├── theme/                  # Misskey-compatible theme compiler & applier
├── utils/                  # Shared utilities
└── views/                  # Page components (NoteDetail, UserProfile)

src-tauri/src/              # Rust backend (Tauri 固有部分)
├── lib.rs                  # App setup (tray, plugins, state)
├── commands.rs             # Tauri IPC command handlers (notecli 呼び出し)
├── http_server.rs          # Axum HTTP API server (localhost:19820)
├── image_cache.rs          # 3-tier image cache (memory → disk → network)
├── ogp.rs                  # OGP metadata extraction & cache
├── streaming.rs            # TauriEmitter adapter (FrontendEmitter trait impl)
├── query_bridge.rs         # HTTP API ↔ frontend (Pinia) bridge
└── main.rs                 # Entry point
```

Misskey API クライアント・DB・モデル・ストリーミングコアなどの共通ロジックは全て `notecli` クレートにあり、`src-tauri/` には Tauri 固有の薄いラッパー（約 2,800 行）のみ残っています。

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
