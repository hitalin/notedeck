<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="NoteDeck" width="96" />
</p>

<h1 align="center">NoteDeck</h1>

<p align="center">
  複数の Misskey サーバーをひとつのデッキで。<br />
  <strong>マルチサーバー対応 Misskey デッキクライアント</strong>
</p>

<p align="center">
  <a href="https://github.com/hitalin/notedeck/releases/latest"><img src="https://img.shields.io/github/v/release/hitalin/notedeck?style=flat-square" alt="GitHub Release" /></a>
  <a href="https://aur.archlinux.org/packages/misskey-notedeck-bin"><img src="https://img.shields.io/aur/version/misskey-notedeck-bin?style=flat-square&logo=archlinux&label=AUR" alt="AUR" /></a>
  <a href="https://github.com/hitalin/notedeck/blob/main/LICENSE"><img src="https://img.shields.io/github/license/hitalin/notedeck?style=flat-square" alt="License" /></a>
</p>

<p align="center">
  <a href="https://github.com/hitalin/notedeck/releases/latest"><strong>ダウンロード</strong></a> ·
  <a href="#インストール">インストール</a> ·
  <a href="https://github.com/hitalin/notedeck/issues">Issues</a> ·
  <a href="ROADMAP.md">Roadmap</a>
</p>

---

<img width="1919" height="1029" alt="スクリーンショット 2026-03-06 211423" src="https://github.com/user-attachments/assets/797cbd5a-f358-43ac-b4ed-50ded014f5fb" />

## Misskey を、もっと快適に

NoteDeck は Misskey とそのフォークに対応したデッキクライアントです。デスクトップでは複数サーバーのタイムラインを一画面に並べて、キーボードだけで操作できます。Android ではタブ切替で同じカラムにアクセスできます。

---

### マルチサーバー & フォーク対応

複数の Misskey 互換サーバーに同時ログイン。サーバーごとにテーマカラーが自動で切り替わるので、どのアカウントで見ているか一目でわかります。フォーク固有の機能も使えます。

### 18 種類のカラムを自由に配置

タイムライン・通知・検索・リスト・アンテナ・お気に入り・クリップ・チャンネル・あなた宛て・ダイレクト・チャット・ユーザー・ウィジェット・AiScript・Play・Pages・お知らせ・ドライブ の 18 種類のカラムをドラッグ＆ドロップで好きなように並べられます。幅も自由にリサイズ可能。

### オフラインでも使える全文検索

受信したノートはすべてローカルに保存。ネットが切れてもタイムラインを読み返せます。日本語に対応した全文検索で、過去のノートを瞬時に見つけられます。

### キーボードで完結

`j` / `k` でノート移動、`r` でリプライ、`e` でリアクション、`q` でリノート。`Ctrl+K` のコマンドパレットからすべての操作にアクセスできます。マウスに手を伸ばす必要はありません。

### MFM & カスタム絵文字を完全サポート

アニメーション MFM、サーバー固有のカスタム絵文字・リアクション、コードハイライト、OGP プレビューなど、Misskey の表現力をそのまま。

### AiScript エディタ内蔵

Misskey Play 互換の AiScript 実行環境をウィジェットカラムに搭載。シンタックスハイライト・オートコンプリート・リアルタイム構文チェック付きの CodeMirror 6 エディタで、デッキの中でスクリプトを書いてそのまま動かせます。

### 外部ツールとの連携

HTTP API（`localhost:19820`）で外部ツールや AI エージェントから NoteDeck を操作できます。SSE イベントストリームにも対応。

---

## インストール

### パッケージマネージャ

**Arch Linux (AUR)**

```bash
yay -S misskey-notedeck-bin
```

**Nix Flake**

```bash
nix run github:hitalin/notedeck
```

### 直接ダウンロード

[**最新版をダウンロード**](https://github.com/hitalin/notedeck/releases/latest)

| OS | ファイル |
|---|---|
| Windows | `.exe` (NSIS インストーラー) |
| macOS | `.dmg` (Universal: Apple Silicon + Intel) |
| Linux | `.deb` / `.AppImage` |
| Android | `.apk` |

---

## 貢献する

NoteDeck はフォークごとの adapter を追加することで、対応サーバーを広げていく設計です。「自分の鯖の機能を NoteDeck で使いたい」という方の PR を歓迎します。

- **フォーク対応の追加** — [DEVELOPMENT.md](DEVELOPMENT.md) の "Adding support for a new fork" を参照
- **バグ報告・機能提案** — [Issues](https://github.com/hitalin/notedeck/issues)
- **開発環境のセットアップ** — [DEVELOPMENT.md](DEVELOPMENT.md)

## 支援する

NoteDeck は個人で開発しているオープンソースプロジェクトです。開発の継続を支援していただける方は [GitHub Sponsors](https://github.com/sponsors/hitalin) からお願いします。

## ライセンス

[AGPL-3.0](LICENSE)
