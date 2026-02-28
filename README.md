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

<img width="1198" height="800" alt="image" src="https://github.com/user-attachments/assets/e7fa0f9e-7c6c-4194-93b6-199fc90e44c2" />

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
| Android (GrapheneOS) | 利用可能 |

> **Note:** NoteDeck はデスクトップ特化のアプリケーションです。Android ビルドは GrapheneOS 等のカスタム ROM 向けに APK を提供していますが、公式 Android（Google Play）および iOS のサポート予定はありません。
>
> **理由:**
> - **iOS** — App Store 審査の通過が必須で、TestFlight 等の配布にも Apple Developer Program（年額 $99）への加入と Mac でのビルドが必要です。個人開発で維持し続けるにはコストと手間が見合いません。
> - **公式 Android** — Google が 2026 年 9 月に導入予定の [Android Developer Verification](https://keepandroidopen.org/) により、Google 未登録の開発者が作成したアプリはインストールがブロックされる見込みです。Google Play 非経由の APK 直配布という従来のメリットが失われるため、公式 Android のサポートは行いません。
> - **GrapheneOS** — Google Play サービス（GMS）に依存しないカスタム ROM のため、上記の制約を受けずに APK を直接インストールできます。

## インストール

[Releases ページ](https://github.com/hitalin/notedeck/releases/latest) から最新版をダウンロードしてください。

| OS | ファイル |
|---|---|
| Windows | `NoteDeck-x.x.x-windows-x64.zip` |
| macOS | `NoteDeck-x.x.x-macos-universal.zip` |
| Linux | `NoteDeck-x.x.x-linux-x64.tar.gz` |
| Android (GrapheneOS) | `NoteDeck-x.x.x-android.apk` |

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
