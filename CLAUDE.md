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

## Vue Vapor モード移行準備（#52）

Vue 3.6 の Vapor モード移行を予定。新規・既存コンポーネントは以下の制約を守ること：

- **`<script setup>` 必須** — Options API / `export default {}` 禁止
- **`h()` / JSX 禁止** — テンプレート構文のみ使用
- **カスタムディレクティブ禁止** — composable で代替
- **mixins / extends 禁止** — composable で代替
- **`getCurrentInstance()` 禁止** — provide/inject または composable で代替
- **`app.config.globalProperties` 禁止** — provide/inject で代替

## アーキテクチャ要点

- API クライアント・DB・ストリーミングは全て **notecli** クレート側（`src-tauri/` は薄いラッパー）
- フォーク対応は adapter パターン（`src/adapters/`）
- ゲスト・ログアウト対応: 公開 API は `get_credentials_or_anon()`、認証必須 API は `get_credentials()` を使用（詳細は [DEVELOPMENT.md](DEVELOPMENT.md) の "Guest Mode & Logout Fallback"）
- **ウィンドウ / カラム**: ストリーム系はカラム（永続）、詳細・ツール系はウィンドウ（一時）。カラムは `accountId: null` で cross-account 対応（詳細は [DEVELOPMENT.md](DEVELOPMENT.md) の "Window / Column Model"）
- **ナビバー**: VSCode Activity Bar 式。カラムのトグルボタン。ボタン構成はカスタマイズ可能（`NavItem` 型でプロファイルに永続化）
- 詳細は [DEVELOPMENT.md](DEVELOPMENT.md) 参照

## リリース手順

バージョンは以下の **3ファイルを同期** して管理する。手順を飛ばさないこと。

### 1. バージョンバンプ（develop ブランチ上）

以下の3ファイルのバージョンを更新：
- `package.json` — `"version": "X.Y.Z"`
- `src-tauri/Cargo.toml` — `version = "X.Y.Z"`
- `src-tauri/tauri.conf.json` — `"version": "X.Y.Z"`

```bash
# Cargo.lock も同期
cd src-tauri && cargo check && cd ..
```

コミット: `chore: bump version to X.Y.Z`

### 2. PR 作成・マージ

- develop → main の PR を作成（タイトル例: `Release vX.Y.Z`）
- `task changelog` で変更一覧を PR 本文に記載
- CI（lint, typecheck, test）が通ることを確認
- マージ

### 3. タグ作成・プッシュ（CI トリガー）

```bash
git checkout main && git pull
git tag -s vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```

タグ push で `.github/workflows/release.yml` が起動：
- check → build（macOS/Linux/Windows）→ publish（GitHub Release draft）→ AUR & winget 更新

### 4. GitHub Release 確認

- GitHub Release（draft）が作成される → 内容確認後 publish
- アーティファクト: AppImage, DMG, NSIS, latest.json, SHA256SUMS.txt 等
