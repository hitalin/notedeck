# NoteDeck Design Document

設計思想と方針をまとめたドキュメント。実装詳細は [DEVELOPMENT.md](DEVELOPMENT.md) を参照。

## Data Sovereignty（データ主権）

NoteDeck はユーザーのデータ主権を尊重する。ユーザーが意図的にカスタマイズした設定はすべて**テキストファイル**として管理し、バックアップ・インポート・端末間共有を可能にする。

### 原則

- **ファイルが source of truth** — localStorage はキャッシュ/起動高速化の役割
- **人間が読み書き可能** — JSON5/CSS/AiScript 等のテキスト形式を採用
- **アプリ非依存** — テキストエディタで直接編集可能。アプリが消えてもデータは残る
- **ポータブル** — ファイルコピーで別端末に持ち運べる

### ファイル構造

```
appDataDir/
├── notecli.db              # SQLite（アカウント/サーバー情報）
└── notedeck/               # 設定ファイル群
    ├── profiles/
    │   └── *.ndprofile.json5   # デッキプロファイル
    ├── themes/
    │   └── *.ndtheme.json5     # カスタムテーマ（Misskey互換）
    ├── custom.css              # カスタムCSS
    ├── keybinds.json5          # キーバインド上書き
    └── plugins/
        ├── *.is                # AiScript プラグインコード
        └── *.meta.json5        # プラグインメタデータ
```

**appDataDir の場所:**

| OS | パス |
|----|------|
| Windows | `%APPDATA%\com.notedeck.desktop` |
| macOS | `~/Library/Application Support/com.notedeck.desktop` |
| Linux | `~/.local/share/com.notedeck.desktop` |

### ファイル形式の選定

| 形式 | 用途 | 理由 |
|------|------|------|
| JSON5 | プロファイル・テーマ・キーバインド | コメント可、trailing comma 可、Misskey テーマと互換 |
| CSS | カスタムCSS | そのまま。エディタのシンタックスハイライトが効く |
| AiScript (.is) | プラグイン | AiScript 標準拡張子 |

TOML/YAML/純粋JSON は、現状の設定構造では導入する積極的理由がないため不採用。

## プロファイル仕様（.ndprofile.json5）

### フォーマット

```json5
{
  name: "メイン作業用",
  createdAt: 1711100000000,
  columns: [
    {
      // Misskey 互換フィールド
      id: "col-1711100000000-1",
      type: "tl",
      name: null,
      width: 400,
      tl: "home",

      // NoteDeck 拡張フィールド
      accountId: "abc123",        // ローカルDB参照用
      account: "user@misskey.io", // ポータブル識別子
    },
  ],
  layout: [
    ["col-1711100000000-1"],       // 1カラム目（単独）
    ["col-2", "col-3"],           // 2カラム目（スタック: 縦積み）
  ],
  windows: [],                    // マルチウィンドウレイアウト
}
```

### Misskey 互換性

カラム定義は Misskey 本家の Column 型と互換。JSON は未知のフィールドを無視するため：

- **Misskey → NoteDeck**: `accountId` なし → デフォルトアカウントを割り当て
- **NoteDeck → Misskey**: 独自フィールド（`accountId`, `account`, `windowId` 等）は無視される

NoteDeck 独自の拡張フィールド:

| フィールド | 型 | 用途 |
|-----------|-----|------|
| `accountId` | `string` | ローカルDB のアカウントID参照 |
| `account` | `string` | `"user@host"` 形式のポータブル識別子 |
| `windowId` | `string` | マルチウィンドウ割り当て |
| `query` | `string` | 検索カラムのクエリ |
| `filters` | `object` | タイムラインフィルタ |
| `clipId` | `string` | クリップID |
| `userId` | `string` | ユーザーカラムの対象ユーザー |
| `aiscriptCode` | `string` | AiScript カラムのコード |
| `flashId` | `string` | Misskey Play ID |
| `pageId` | `string` | Misskey Pages ID |

### 端末間ポータビリティ

`accountId` はローカル DB に依存するため端末間で一致しない。`account` フィールド（`"user@host"` 形式）を併記し、インポート時にローカルアカウントを逆引きする:

| ケース | 動作 |
|--------|------|
| 同一端末 | `accountId` でそのまま解決 |
| 別端末（NoteDeck） | `account` からローカル `accountId` を逆引き |
| Misskey 本家からのインポート | `accountId` なし → デフォルトアカウント割り当て |

## バックアップ

NoteDeck のデータは大きく2種類に分かれる:

| 種別 | 内容 | ファイル |
|------|------|----------|
| **DB** | アカウント・サーバー情報・キャッシュ | `notecli.db` |
| **設定** | プロファイル・テーマ・CSS・キーバインド・プラグイン | テキストファイル群 |

### アプリ内バックアップ（設定メニュー）

設定メニューの「データ」セクションから以下の操作が可能:

| 操作 | 対象 | 形式 | 備考 |
|------|------|------|------|
| **DB エクスポート** | `notecli.db` | SQLite | アカウント・サーバー情報の完全バックアップ |
| **DB インポート** | `notecli.db` | SQLite | SQLiteヘッダ検証付き。インポート後アプリ再起動 |
| **設定エクスポート** | テキストファイル群 | JSON | `profiles/` `themes/` `plugins/` `custom.css` `keybinds.json5` をキー→値のJSONバンドルとして出力 |
| **設定インポート** | テキストファイル群 | JSON | パストラバーサル防止・ホワイトリスト検証付き。インポート後アプリ再起動 |

**セキュリティ:**
- DB インポート: SQLite マジックバイト（`SQLite format 3\0`）を検証。WAL/SHM ファイルも自動クリーンアップ
- 設定インポート: `..` や絶対パスを含むエントリを拒否。許可されたディレクトリ/ファイル名のみ展開

### 手動バックアップ

1. **ディレクトリコピー** — `appDataDir/` 以下をそのままコピー（最も確実）
2. **個別ファイル編集** — テキストエディタで JSON5/CSS を直接編集し、再起動で反映

### 端末間同期（シンボリックリンク方式）

アプリ側にカスタムディレクトリ設定は実装しない。ユーザーがシンボリックリンクで保存先をクラウドストレージに向ける:

```bash
# 例: profiles/ を Dropbox に同期
ln -s ~/Dropbox/notedeck/profiles ~/.local/share/com.notedeck.desktop/profiles
```

この方式の利点:
- アプリ側のコード追加不要
- `profiles/` だけ、`themes/` だけ、といった粒度の選択がユーザー側で自由
- Dropbox/OneDrive/Google Drive/Syncthing/Git/NAS 等、何でも使える
- アプリが知らないストレージサービスにも対応

### マイグレーション

localStorage → ファイルへの自動マイグレーション:

1. 起動時に各設定ディレクトリのファイル存在を確認
2. ファイルが 0 件かつ localStorage にデータあり → テキストファイルとして書き出し
3. マイグレーション完了後、localStorage はキャッシュとして維持（削除しない）
4. 以降はファイルが source of truth

対象: プロファイル（`.ndprofile.json5`）、テーマ（`.ndtheme.json5`）、カスタムCSS（`custom.css`）、キーバインド（`keybinds.json5`）、プラグイン（`.is` + `.meta.json5`）
