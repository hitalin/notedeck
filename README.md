<div align="center">

<img src="src-tauri/icons/128x128@2x.png" alt="NoteDeck" width="96" />

# NoteDeck

**複数の Misskey サーバーをひとつのデッキで。**

マルチサーバー対応 Misskey デッキクライアント

[![CI](https://github.com/hitalin/notedeck/actions/workflows/ci.yml/badge.svg)](https://github.com/hitalin/notedeck/actions/workflows/ci.yml)
[![GitHub Release](https://img.shields.io/github/v/release/hitalin/notedeck?style=flat-square)](https://github.com/hitalin/notedeck/releases/latest)
[![winget](https://img.shields.io/badge/winget-Hitalin.NoteDeck-blue?style=flat-square&logo=windows)](https://github.com/microsoft/winget-pkgs/tree/master/manifests/h/Hitalin/NoteDeck)
[![AUR](https://img.shields.io/aur/version/misskey-notedeck-bin?style=flat-square&logo=archlinux&label=AUR)](https://aur.archlinux.org/packages/misskey-notedeck-bin)
[![Nix Flake](https://img.shields.io/badge/nix-flake-blue?style=flat-square&logo=nixos)](https://github.com/hitalin/notedeck)
[![License](https://img.shields.io/github/license/hitalin/notedeck?style=flat-square)](https://github.com/hitalin/notedeck/blob/main/LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/hitalin/notedeck?style=flat-square)](https://github.com/hitalin/notedeck/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/hitalin/notedeck/pulls)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/hitalin/notedeck)

[ダウンロード](https://github.com/hitalin/notedeck/releases/latest) ·
[Issues](https://github.com/hitalin/notedeck/issues) ·
[Roadmap](ROADMAP.md)

</div>

<img width="1191" height="800" alt="スクリーンショット 2026-03-26 105548" src="https://github.com/user-attachments/assets/3255a9ab-24f9-4708-8887-a6966a6a2e11" />

## ダウンロード

[**最新版をダウンロード**](https://github.com/hitalin/notedeck/releases/latest)

| Windows | macOS | Linux | Android |
|---|---|---|---|
| `.exe` | `.dmg` (Universal) | `.deb` / `.AppImage` | `.apk` |

**Windows (winget)**

```bash
winget install Hitalin.NoteDeck
```

**Arch Linux (AUR)**

```bash
yay -S misskey-notedeck-bin
```

**Nix Flake**

```bash
nix run github:hitalin/notedeck
```

> [!NOTE]
> Windows / Android ではインストール時にセキュリティ警告が表示されることがあります。
> これはアプリがコード署名されていないためで、マルウェアではありません。
> ソースコードは公開されており、ビルドは GitHub Actions で自動化されています。
> プロジェクトの成長に伴い、正式なコード署名の導入を予定しています。

## 貢献する

PR を歓迎します。詳しくは [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

- **開発を始める** — [DEVELOPMENT.md](DEVELOPMENT.md) に環境構築からアーキテクチャまで記載
- **フォーク対応の追加** — [DEVELOPMENT.md](DEVELOPMENT.md#adding-support-for-a-new-fork) の手順に沿って PR
- **バグ報告・機能提案** — [Issues](https://github.com/hitalin/notedeck/issues)（テンプレートあり）

## 支援する

NoteDeck は個人で開発しているオープンソースプロジェクトです。
[GitHub Sponsors](https://github.com/sponsors/hitalin) で開発の継続を支援できます。

## ライセンス

[AGPL-3.0](LICENSE)
