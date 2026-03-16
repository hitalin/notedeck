# NoteDeck — Claude Code 設定

Misskey 系マルチサーバー対応デッキクライアント。Tauri v2 + Vue 3 + TypeScript + Pinia。

## 開発コマンド

```bash
task dev          # Vite dev server（ブラウザ確認用）
task dev:tauri    # Tauri デスクトップ開発
task test         # vitest run
task lint         # biome check
task lint:fix     # biome check --write
task typecheck    # vue-tsc --noEmit
```

## Git ワークフロー

- **main への直接 push 禁止** — 必ずブランチを切って PR 経由でマージする
- ブランチ命名: `feat/*`, `fix/*`, `refactor/*`, `chore/*`, `docs/*`
- コミット: Conventional Commits 形式
- pre-commit hook (lefthook): biome check + vue-tsc --noEmit

## スタイリング

- `<style module lang="scss">` + `$style.xxx` で参照（CSS Modules）
- グローバル CSS 変数: `src/styles/global.css`
- モバイル/デスクトップ切り替えは `v-if`（CSS display ではない）

## アーキテクチャ要点

- API クライアント・DB・ストリーミングは全て **notecli** クレート側（`src-tauri/` は薄いラッパー）
- フォーク対応は adapter パターン（`src/adapters/`）
- 詳細は [DEVELOPMENT.md](DEVELOPMENT.md) 参照
