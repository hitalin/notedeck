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
  <a href="https://github.com/hitalin/notedeck/issues">Issues</a>
</p>

---

<img width="1198" height="800" alt="image" src="https://github.com/user-attachments/assets/e7fa0f9e-7c6c-4194-93b6-199fc90e44c2" />

## 特徴

- **マルチサーバー** — 複数の Misskey 互換サーバーに同時ログイン。Sharkey・CherryPick などのフォークにも対応
- **デッキ UI** — カラムをドラッグ＆ドロップで自由に配置。タイムライン、通知、検索を一画面に
- **リアルタイム更新** — タイムラインと通知がリアルタイムに反映。自動再接続対応
- **サーバーテーマ自動適用** — サーバーごとのテーマカラーをカラムに反映し、アカウントを一目で識別
- **カスタム絵文字 & リアクション** — サーバー固有の絵文字とリアクションを完全サポート

## ダウンロード

[Releases ページ](https://github.com/hitalin/notedeck/releases/latest) から最新版をダウンロードしてください。

| OS | ファイル |
|---|---|
| Windows | `NoteDeck-x.x.x-windows-x64.zip` |
| macOS | `NoteDeck-x.x.x-macos-universal.zip` |
| Linux | `NoteDeck-x.x.x-linux-x64.tar.gz` |
| Android (GrapheneOS) | `NoteDeck-x.x.x-android.apk` |

> スマートフォンで Misskey を使いたい場合は [Aria](https://github.com/poppingmoon/aria) がおすすめです。

## アーキテクチャ

Misskey API クライアント・DB・ストリーミングなどの共通ロジックは [notecli](https://github.com/hitalin/notecli) に分離されており、NoteDeck はその上に Tauri + Vue の GUI を載せた構成です。notecli は単体でも CLI デーモンとして動作します。

## 開発

[DEVELOPMENT.md](DEVELOPMENT.md) を参照してください。

## ライセンス

[AGPL-3.0](LICENSE)
