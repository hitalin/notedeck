# notedeck

Multi-server Misskey deck client for desktop and mobile.

Connect to multiple Misskey-compatible servers in one deck UI. Runs as a native desktop app (Windows / macOS / Linux) and mobile app (Android / iOS) via Tauri v2.

## Features

- **Multi-server** - Connect to multiple Misskey-compatible servers simultaneously
- **Multi-platform** - Desktop (Windows / macOS / Linux), mobile (Android / iOS)
- **Deck UI** - TweetDeck-style multi-column layout with drag & drop reordering
- **Real-time streaming** - WebSocket-based live timeline updates
- **Custom emoji** - Full support for server-specific custom emoji
- **Fork support** - Extensible adapter pattern for Misskey forks (Sharkey, CherryPick, etc.)

## Platforms

| Platform | Method | Status |
|----------|--------|--------|
| Windows | Tauri v2 | Available |
| macOS | Tauri v2 | Available |
| Linux | Tauri v2 | Available |
| Android | Tauri v2 | Planned |
| iOS | Tauri v2 | Planned |

## Tech Stack

| | |
|---|---|
| Frontend | Vue 3 + TypeScript |
| Build | Vite |
| State | Pinia |
| Local DB | Dexie (IndexedDB) |
| Native | Tauri v2 |
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
src/
├── adapters/       # Server API adapters (Misskey, forks)
│   ├── types.ts    # Shared interfaces (ServerAdapter, ApiAdapter, StreamAdapter)
│   ├── registry.ts # Adapter factory
│   └── misskey/    # Misskey implementation
├── components/     # Vue components
│   ├── common/     # MkNote, etc.
│   └── deck/       # DeckLayout, DeckColumn, DeckTimelineColumn
├── stores/         # Pinia stores (accounts, deck, servers, emojis, etc.)
├── views/          # Page components
├── core/           # Business logic (server detection)
├── composables/    # Vue composables
└── db/             # Dexie schema
```

### Adding support for a new fork

1. Create `src/adapters/<fork>/` directory
2. Extend `MisskeyAdapter` and override only what differs
3. Register in `src/adapters/registry.ts`

Most Misskey forks work with the base adapter as-is.

## License

[AGPL-3.0](LICENSE)
