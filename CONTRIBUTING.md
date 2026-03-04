# Contributing to NoteDeck

## 貢献の方法

### バグ報告・機能提案

[Issues](https://github.com/hitalin/notedeck/issues) から報告してください。
再現手順、スクリーンショット、サーバーのソフトウェア名とバージョンがあると助かります。

### フォーク対応の追加

NoteDeck の成長は対応フォークの数に直結します。
「自分の鯖の固有機能を NoteDeck で使いたい」という PR を歓迎します。

詳しい手順は [DEVELOPMENT.md](DEVELOPMENT.md) の "Adding support for a new fork" を参照してください。

### コードの貢献

1. リポジトリをフォーク
2. ブランチを作成（`git checkout -b feat/your-feature`）
3. `task lint` と `task test` を通す
4. Pull Request を作成

## 開発方針

- **差分を小さく**: 1 つの PR では 1 つのことだけ変える
- **既存パターンに従う**: プロジェクトの慣例を尊重する
- **機能網羅より体験品質**: 少ない機能を心地よく使えることを優先する

## コード以外の貢献

- 使っているフォークの情報共有（API の差異、固有機能の仕様）
- スクリーンショットやデモ動画の提供
- ドキュメントの翻訳・改善

## ライセンス

貢献されたコードは [AGPL-3.0](LICENSE) の下で公開されます。
