<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="NoteDeck" width="96" />
</p>

<h1 align="center">NoteDeck</h1>

<p align="center">
  複数の Misskey サーバーをひとつのデッキで。<br />
  <strong>デスクトップ専用・マルチサーバー対応 Misskey デッキクライアント</strong>
</p>

<p align="center">
  <a href="https://github.com/hitalin/notedeck/releases/latest">Download</a> ·
  <a href="https://github.com/hitalin/notedeck/issues">Issues</a>
</p>

---

<img width="1919" height="1029" alt="スクリーンショット 2026-03-04 150811" src="https://github.com/user-attachments/assets/59fb7359-c6fa-4aa0-beb0-cf421ac563c5" />

## なぜ NoteDeck？

Misskey のフォーク（Sharkey・CherryPick・Firefish・Iceshrimp 等）はそれぞれ独自機能を持ちますが、モバイルクライアントは本家 API にしか追従できず、結局 PWA に戻るしかありません。NoteDeck はフォーク固有の機能も拾うことを目標とした、デスクトップ専用のデッキクライアントです。

- スマホで Misskey → **PWA** か **[Aria](https://github.com/poppingmoon/aria)** を使う
- デスクトップで Misskey → **NoteDeck**

## 特徴

- **フォーク対応** — Misskey 本家に加え、Sharkey・CherryPick 等のフォーク固有機能もサポート。adapter パターンでフォークごとの差異を吸収
- **マルチサーバー** — 複数の Misskey 互換サーバーに同時ログイン。異なるサーバーのカラムを一画面で俯瞰
- **デッキ UI** — 14 種のカラム（TL・通知・検索・リスト・アンテナ・チャット等）をドラッグ＆ドロップで自由に配置
- **ローカル全文検索** — SQLite FTS5 でノートを無期限キャッシュ。オフラインでも閲覧・検索可能
- **キーボード操作** — Vim ライクな TL 操作（j/k/e/r/q）、コマンドパレット（Ctrl+K）、グローバルホットキー
- **サーバーテーマ自動適用** — サーバーごとのテーマカラーをカラムに反映し、アカウントを一目で識別
- **カスタム絵文字 & MFM** — サーバー固有の絵文字・リアクションと MFM アニメーションを完全サポート
- **HTTP API** — `localhost:19820` で外部ツールや AI エージェントから操作可能（SSE イベントストリーム対応）
- **AiScript** — Misskey Play 互換のスクリプト実行環境とCodeMirror 6 エディタをウィジェットカラムに内蔵

## ダウンロード

[Releases ページ](https://github.com/hitalin/notedeck/releases/latest) から最新版をダウンロードしてください。

| OS | ファイル |
|---|---|
| Windows | `.exe` (NSIS インストーラー) |
| macOS | `.dmg` (Universal: Apple Silicon + Intel) |
| Linux | `.deb` / `.AppImage` |

## アーキテクチャ

Misskey API クライアント・DB・ストリーミングなどの共通ロジックは [notecli](https://github.com/hitalin/notecli) に分離されており、NoteDeck はその上に Tauri + Vue の GUI を載せた構成です。notecli は単体でも CLI デーモンとして動作します。

## 開発

[DEVELOPMENT.md](DEVELOPMENT.md) を参照してください。

## ライセンス

[AGPL-3.0](LICENSE)
