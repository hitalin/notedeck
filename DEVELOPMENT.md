# notedeck

Multi-server Misskey deck client for desktop.

Connect to multiple Misskey-compatible servers in one deck UI. Runs as a native desktop app (Windows / macOS / Linux) via Tauri v2. An Android APK is also available for custom ROMs (GrapheneOS).

## Features

- **Multi-server** - Connect to multiple Misskey-compatible servers simultaneously
- **Multi-platform** - Desktop (Windows / macOS / Linux), Android APK (GrapheneOS)
- **Deck UI** - TweetDeck-style multi-column layout with drag & drop reordering
- **Real-time streaming** - WebSocket streaming with auto-reconnect (Rust backend)
- **Notifications** - Dedicated notification column with real-time updates
- **Per-account themes** - Fetches and applies each account's server theme
- **Custom emoji** - Full support for server-specific custom emoji
- **Fork support** - Extensible adapter pattern for Misskey forks (Sharkey, CherryPick, etc.)

## Platforms

| Platform | Method | Status |
|----------|--------|--------|
| Windows | Tauri v2 | Available |
| macOS | Tauri v2 | Available |
| Linux | Tauri v2 | Available |
| Android (GrapheneOS) | Tauri v2 | Available |

> **Note:** NoteDeck is a desktop-focused application. The Android APK is provided for custom ROMs such as GrapheneOS. Official Android (Google Play) and iOS are not supported.
>
> **Why no official Android / iOS?**
> - **iOS** — Requires App Store review, Apple Developer Program ($99/year), and a Mac for building. The ongoing cost and effort are not sustainable for an individual developer.
> - **Official Android** — Google's upcoming [Android Developer Verification](https://keepandroidopen.org/) (September 2026) will block installation of apps from unregistered developers, eliminating the advantage of direct APK distribution.
> - **GrapheneOS** — As a custom ROM independent of Google Play Services (GMS), it is unaffected by the above restrictions and can freely sideload APKs.
>
> For a mobile Misskey client, we recommend [Aria](https://github.com/poppingmoon/aria).

## Tech Stack

| | |
|---|---|
| Frontend | Vue 3 + TypeScript |
| Backend | Rust (Tauri v2) |
| Build | Vite + Cargo |
| State | Pinia |
| Local DB | SQLite (rusqlite, WAL mode) |
| HTTP | reqwest (Rust) |
| WebSocket | tokio-tungstenite (Rust) |
| Linter | Biome |
| Test | Vitest |

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

```
src/                        # Vue 3 frontend
├── adapters/               # Server API adapters (Misskey, forks)
│   ├── types.ts            # Shared interfaces (ServerAdapter, ApiAdapter, StreamAdapter)
│   ├── registry.ts         # Adapter factory
│   └── misskey/            # Misskey implementation (IPC via invoke/listen)
├── components/             # Vue components
│   ├── common/             # MkNote, MkPostForm, MkEmoji, etc.
│   └── deck/               # DeckLayout, DeckColumn, DeckTimelineColumn
├── stores/                 # Pinia stores (accounts, deck, servers, emojis, theme, etc.)
├── views/                  # Page components (NoteDetail, UserProfile)
├── core/                   # Business logic (server detection)
├── composables/            # Vue composables (useTheme, etc.)
├── theme/                  # Theme compiler & applier
└── utils/                  # Shared utilities

src-tauri/src/              # Rust backend
├── api.rs                  # Misskey HTTP API client (reqwest)
├── streaming.rs            # WebSocket streaming with auto-reconnect
├── commands.rs             # Tauri IPC command handlers
├── db.rs                   # SQLite database (rusqlite, WAL mode)
├── models.rs               # Shared data models & normalization
└── lib.rs                  # App setup (tray, plugins, state)
```

### Adding support for a new fork

1. Create `src/adapters/<fork>/` directory
2. Extend `MisskeyAdapter` and override only what differs
3. Register in `src/adapters/registry.ts`

Most Misskey forks work with the base adapter as-is.

## License

[AGPL-3.0](LICENSE)
