<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="NoteDeck" width="96" />
</p>

<h1 align="center">NoteDeck</h1>

<p align="center">
  複数の Misskey サーバーをひとつのデッキで。<br />
  <strong>マルチサーバー対応 Misskey デッキクライアント</strong>
</p>

<p align="center">
  <a href="https://github.com/hitalin/notedeck/releases/latest">Download</a> ·
  <a href="DEVELOPMENT.md">Development Guide</a> ·
  <a href="https://github.com/hitalin/notedeck/issues">Issues</a>
</p>

---

## NoteDeck とは

NoteDeck は、複数の Misskey 互換サーバーに同時接続できるデスクトップクライアントです。TweetDeck のようなマルチカラムレイアウトで、複数のアカウント・サーバーのタイムラインを一画面で確認できます。

<!-- スクリーンショットを後で追加:
![NoteDeck Screenshot](docs/screenshot.png)
-->

## 特徴

### マルチサーバー

複数の Misskey 互換サーバーにアカウントを追加し、ひとつのアプリで一括管理。Sharkey、CherryPick などのフォークにも対応しています。

### デッキ UI

ドラッグ＆ドロップで自由にカラムを並べ替え。タイムライン、通知、検索などのカラムを好みのレイアウトに配置できます。

### リアルタイム

Rust 製バックエンドによる WebSocket ストリーミングで、タイムラインと通知がリアルタイムに更新されます。自動再接続にも対応。

### サーバーテーマ自動適用

各サーバーが設定しているテーマカラーを自動でフェッチして適用。サーバーごとにカラムの見た目が変わるので、どのアカウントの情報かが一目でわかります。

### カスタム絵文字 & リアクション

サーバー固有のカスタム絵文字を完全サポート。リアクションピッカーからの絵文字選択や、リアクションしたユーザーの一覧表示にも対応しています。

## 対応プラットフォーム

| プラットフォーム | 状況 |
|:---:|:---:|
| Windows | 利用可能 |
| macOS | 利用可能 |
| Linux | 利用可能 |
| Android | 予定 |
| iOS | 予定 |

## インストール

[Releases ページ](https://github.com/hitalin/notedeck/releases/latest) から最新版をダウンロードしてください。

| OS | ファイル |
|---|---|
| Windows | `NoteDeck_x.x.x_x64-setup.exe` |
| macOS | `NoteDeck_x.x.x_aarch64.dmg` |
| Linux | `notedeck_x.x.x_amd64.deb` / `.AppImage` |

## 技術スタック

|  |  |
|---|---|
| フロントエンド | Vue 3 + TypeScript |
| バックエンド | Rust（Tauri v2） |
| ローカル DB | SQLite（WAL mode） |
| WebSocket | tokio-tungstenite |

## 開発

開発環境のセットアップや詳細なアーキテクチャについては [DEVELOPMENT.md](DEVELOPMENT.md) を参照してください。

```bash
pnpm install
task dev:tauri
```

## ライセンス

[AGPL-3.0](LICENSE)
