# NoteDeck Design Document

設計思想と方針をまとめたドキュメント。実装詳細は [DEVELOPMENT.md](DEVELOPMENT.md) を参照。

## 設計原則

- Apple 式直感 UI: 設定項目を増やさず、触ればわかる操作で完結
- 機能網羅より体験品質: 少ない機能を心地よく使えることを優先
- Web UI へのリンク導線: 非対応機能はブラウザで開けるようにする
- サーバー運営者との共生: 広告表示・支援導線を整備し、エコシステムの持続可能性に貢献する
- ライブラリ選定は Misskey 本家追従（後述）
- **User Respect over Engagement Maximization** — ユーザーの注意を奪わず、コントロールを返す（後述）

## UX 思想 — Engagement Maximization よりも User Respect

NoteDeck は「ユーザーの注意を奪わず、コントロールを返す」設計を採る。X / Threads / Instagram に見られる滞在時間最大化のための UI パターンは、広告ビジネスを支える経済合理性の産物であり、Misskey エコシステム（広告非依存・分散・ユーザー主権）には合致しない。Bluesky / Misskey 公式 / Mastodon が同様にこれらを採用しないのも同じ理由による。

VSCode・Apple 純正アプリのように「ユーザーがやりたいことを最短でやらせて、終わったら手放す」を理想とする。

### 採用しないダークパターン

| パターン | 例 | 不採用理由 |
|---|---|---|
| スクロール連動 UI 退避 | スクロール時にナビバー / FAB を隠す | "もう少し見せる" ための 1px 稼ぎ。広告・エンゲージメント駆動の意匠 |
| 過剰なバッジ煽り | "9+", "新着 N 件" の強調表示 | 強迫的に開かせる装置 |
| 時刻の曖昧化 | "たった今" を長く維持、絶対時刻を隠す | "新鮮なものがある" 感の演出 |
| 終端隠蔽 | 無限スクロールで読了を伝えない | 終わらせない設計 |
| 離脱の摩擦 | 戻る・閉じるが奥にある、確認モーダルでの引き止め | 滞在時間延長のための心理的コスト |
| 自動再生・大音量サムネ | 動画自動再生 | 注意を強制的に引く |
| アルゴリズム介入の通知 | "あなたへのおすすめ" 割り込み | 受動的体験への誘導 |
| 装飾アニメ・過剰なバウンス | プルリフレッシュの過剰な弾性 | ドーパミン的に "もう一回" を誘発 |

### 採用するパターン

**レイアウト**

- **静的・予測可能**: 同じ要素は常に同じ場所に配置する。マッスルメモリーが効く = 認知負荷ゼロ
- **アフォーダンス可視**: 主要アクションはアイコンで見えている。ジェスチャは "おまけ" であって必須機能にしない
- **読了の明示**: 既読と新着の境界に "ここまで読みました" 区切り線を honest に表示する (アプリ・カラム再オープン時、前回 topmost に居た位置の上に divider を出す)

**アニメーション**

- **機能的アニメだけ**: "開いた / 閉じた / 移動した" を伝えるためのものに限る。装飾アニメは入れない
- **短く (150–250ms)**: 長いアニメは "気持ちいい" が "操作を待たされる" に変わる
- **ease-out 主体・bounce 禁止**: 弾性は注意を引きすぎる
- **`prefers-reduced-motion` 尊重**: アクセシビリティ対応必須
- **共有要素遷移**: ノート → 詳細など同一物の移動はトラッキングできるように

**情報の honesty**

- **絶対カウント**: "12" であって "9+" ではない（ただし 999 超で "1k" は可）
- **絶対時刻併記**: 相対時刻 + tooltip で絶対時刻
- **誠実なロード状態**: "Loading..." と書く。スケルトン UI で偽装しない（体感的に逆に遅く感じるため不採用）
- **エラーは隠さず説明**: 黙って失敗しない

**通知・操作**

- **未読は粒度高く ON / OFF**: 何を通知するか細かく選べる
- **FAB 常駐**: 投稿ボタンは常に同じ場所（モバイルでもスクロールで消さない）
- **キーボードショートカット完備**: IDE 思想と整合
- **コマンドパレット中心の機能発見性**: メニューで埋め尽くさない

### 判断基準

新しい UI / アニメ / 通知パターンを追加するときは、必ずこう問う:

> **これはユーザーがやりたいことを助けているか? それともアプリ内にもう少し留めようとしているか?**

前者だけ採用する。後者は却下する。

## 依存ライブラリ選定方針

NoteDeck のフロントエンド依存ライブラリは、原則として **Misskey 本家 (`misskey-dev/misskey`) が採用しているものと揃える**。本家の実装を参照実装として活用でき、UI 互換性・学習コスト・保守コスト・バンドルサイズを同時に最適化できる。

### 3 原則

1. **本家互換機能は本家と同じライブラリで** — プロフィール Activity タブ、MFM レンダリング、画像クロップ等、本家に同等機能がある場合はライブラリもコード構造も本家を踏襲する。本家の実装（例: `MkChart*.vue`）を参照実装として直接活用できる
2. **独自機能も本家ライブラリで実現可能な範囲まで** — 横断検索・Digital Wellbeing 等の NoteDeck 独自機能でも、本家の既存ライブラリセットで実現可能ならそれを使う。新ライブラリ追加は「本家のライブラリでは実現不可能」と証明された時のみ
3. **本家ライブラリで不可能な機能は原則実装しない** — 連合ネットワーク図・ユーザー向けパフォーマンス監視 UI・高頻度時系列チャート等、本家のライブラリセットでは作れない機能は「構造的に対応しない領域」に倣って最初から作らない

### 具体例: チャート

Misskey 本家は以下のスタックを採用しており、NoteDeck も同一とする:

| ライブラリ | 用途 |
|---|---|
| `chart.js` | チャート本体（折れ線・棒・レーダー等） |
| `chartjs-adapter-date-fns` | 時系列の日付軸 |
| `chartjs-chart-matrix` | カレンダーヒートマップ（プロフィール Activity 等） |
| `chartjs-plugin-gradient` | グラデーション塗り |
| `chartjs-plugin-zoom` | ズーム・パン |

この結果、連合ネットワーク図（Cytoscape/Sigma 等が必要）や高頻度リアルタイム時系列（uPlot 等が必要）は本方針により不実装となる。

### 対象外（NoteDeck のネイティブ・IDE 層）

Misskey 本家が扱わない領域 — デスクトップネイティブ機能・ローカル永続化・IDE 的機能 — は NoteDeck の差別化根幹のため本方針の対象外:

- Tauri v2 (デスクトップランタイム)
- notecli (Rust バックエンド・ローカル DB / API クライアント / ストリーミング)
- CodeMirror 6 + Web Worker LSP (AiScript エディタ)
- @tanstack/vue-virtual (仮想スクロール)
- Scalar (API ドキュメント表示)
- tauri-specta (型付き IPC)
- Shiki (コードハイライト — 本家とは独立導入済み。ただし本家も同一採用のため結果的に一致)

### バージョン追従ポリシー

「同一ライブラリを使う」レベルで十分。本家の patch/minor には逐一追随せず、メジャーバージョンが大きく離れた場合にのみ見直しを検討する。

## Why Multi-Server（なぜマルチサーバーか）

Misskey（ActivityPub）はサーバーが主語の設計になっている。検索はサーバーのローカルインデックス、通知・お気に入り・リストはアカウント単位、フォロー関係もサーバーに紐づく。複数サーバーにアカウントを持つユーザーにとって、これらが分断されることは構造上避けられない。

NoteDeck は複数サーバーへの同時ログインとローカル DB を組み合わせることで、この分断をクライアント側で緩和する。

| 分断 | Misskey 単体 | NoteDeck |
|------|-------------|----------|
| 検索 | サーバーのローカルインデックスのみ | 複数サーバーへ並列クエリ + ローカル FTS5 で大幅改善 |
| 通知 | アカウントごとに散在 | cross-account カラムで統合表示 |
| タイムライン | サーバーごとに分断 | 複数アカウントの TL をマージ可能 |
| フォロー操作 | リモートフォローの UI 遷移が煩雑 | ログイン済みアカウントから直接操作 |
| 既読状態 | クライアント・サーバー間で不整合 | ローカル DB で一元管理 |
| 投稿の永続性 | サーバー依存（サーバー消滅でデータ喪失） | ローカル DB にキャッシュとして残る |

**プロトコルの限界は受け入れる。** ActivityPub のアイデンティティはサーバーに属しており、これはクライアントでは変えられない。NoteDeck が実現するのは「サーバーに縛られない体験」であって「サーバーに縛られない存在」ではない。リスト・アンテナの管理やプロフィール編集など、サーバー側の責務はサーバーに委ねる（[ROADMAP.md](ROADMAP.md) の「構造的に対応しない領域」を参照）。

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
├── notecli.db # SQLite（アカウント/サーバー情報）
└── notedeck/　#エクスポート時は圧縮せず単一テキスト`nodeck.json`
    ├── keybinds.json5 #キーバインド編集ウィンドウで編集可能
    ├── navbar.json5 #ナブバー編集ウィンドウで編集可能
    ├── performance.json5 #パフォーマンス編集ウィンドウで編集可能
    ├── settings.json5
    ├── profiles/ #プロファイル編集ウィンドウで編集可能
    │   └── Main.json5
    ├── themes/ #テーマ編集ウィンドウで編集可能
    │   └── AME.json5
    ├── plugins/ #プラグイン編集ウィンドウで編集可能
    │   ├── *.is
    │   └── *.meta.json5
    ├── custom.css #カスタムCSS編集ウィンドウで編集可能
    └── accounts.json5 #アカウント編集ウィンドウで編集可能
```

**dual-write 統合済みファイル**（`settings.json` に統合済み、旧ファイルは backward-compat で維持）:

- `ai.json` → `ai.*` キーに dual-write 統合済み
- `keybinds.json5` → `keybinds.*` キーに dual-write 統合済み
- `performance.json` → `performance.*` キーに dual-write 統合済み

これらはいずれも NoteDeck 独自フォーマットで Misskey 互換性要件がないため、フラット dot-notation キーとして `settings.json` に取り込んだ。新しい書き込みは `settings.json` に反映され、旧ファイルは read-only で参照される。

**appDataDir の場所:**

| OS | パス |
|----|------|
| Windows | `%APPDATA%\com.notedeck.desktop` |
| macOS | `~/Library/Application Support/com.notedeck.desktop` |
| Linux | `~/.local/share/com.notedeck.desktop` |

### ファイル形式の選定

| 形式 | 用途 | 理由 |
|------|------|------|
| JSON | `settings.json` (スカラー preferences) | VSCode `settings.json` 相当。フラット dot-notation、`$schema` で JSON Schema 補完 (将来)、外部エディタで編集しやすい |
| JSON5 | プロファイル・テーマ | コメント可、trailing comma 可、Misskey テーマと互換 |
| CSS | カスタムCSS | そのまま。エディタのシンタックスハイライトが効く |
| AiScript (.is) | プラグイン | AiScript 標準拡張子 |

**settings.json は JSON (JSON5 ではない)** — VSCode `settings.json` と同じ扱いにするため。将来 JSONC (コメント許可) サポートを検討する余地はあるが、当面は plain JSON。TOML/YAML は現状の設定構造では導入する積極的理由がないため不採用。

### settings.json — VSCode settings.json 相当の統合設定ファイル

NoteDeck のスカラー設定 (選択・トグル・ユーザー preferences) は単一ファイル `settings.json` に集約する。VSCode の `settings.json` と同じ立ち位置:

- **フラット dot-notation キー空間**: `theme.manual`, `modes.realtime`, `performance.maxFps` 等
- **GUI 設定エディタ ↔ raw JSON エディタの 2-way binding**: どちらから編集しても反映
- **不正値は schema のデフォルトにフォールバック**: 安全性
- **`$schema` プロパティ** (将来) でエディタの補完・検証サポート

**settings.json に含まれるもの**:

| カテゴリ | キー例 | 備考 |
|---|---|---|
| テーマ選択状態 | `theme.manual`, `theme.selectedDarkThemeId` | テーマ **定義** は `themes/*.json5` に別置き |
| モード | `modes.realtime`, `modes.offline` | |
| デック | `deck.activeProfileId`, `deck.wallpaper` | プロファイル **定義** は `profiles/*.ndprofile.json5` に別置き |
| パフォーマンス | `performance.maxFps` 等 | `performance.json` と dual-write 統合済み |
| AI | `ai.provider`, `ai.model` 等 | `ai.json` と dual-write 統合済み (API キーは除外) |
| キーバインド | `keybinds.commandPalette` 等 | `keybinds.json5` と dual-write 統合済み |

**settings.json に含まれないもの** (恒久的に別ファイル):

| 対象 | 理由 |
|---|---|
| `themes/*.json5` | Misskey 互換フォーマット維持 — コミュニティテーマを `themes/` に drop するだけで使えるようにするため |
| `plugins/*.is` + `*.meta.json5` | Misskey AiScript プラグインフォーマット維持 |
| `snippets/*.json5` | VSCode スニペット互換フォーマット |
| `profiles/*.ndprofile.json5` | NoteDeck 独自だが複数存在するコレクション。肥大化回避 + 個別エクスポート導線 |
| `memos/*.md` | PKM 連携のため Markdown + YAML frontmatter で外部 vault (Obsidian/Logseq) として直接開ける形式 |
| `custom.css` | CSS は JSON ではない。テキストエディタで直接編集 |
| `accounts.json5` | 環境依存順序。ポータビリティ対象外 |
| アカウントトークン | Rust DB (secure storage) |

**設計原則の背景**: VSCode の `settings.json` は「設定全体」ではなく**スカラー preferences/toggles/selections** の集合。テーマ本体は extension フォルダに、keybindings は `keybindings.json` に、snippets は `.vscode/snippets/` に別置き。NoteDeck もこの構造に倣い、Misskey 互換性が要件となる部分 (themes/plugins) は native format のまま残す。

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
| **設定** | settings.json（スカラー preferences + AI・キーバインド・パフォーマンス統合済み）+ プロファイル・テーマ・CSS・プラグイン | テキストファイル群 |

### バックアップ対象の網羅原則

**原則**: 「バックアップされるもの = 設定」。localStorage のみにしかない設定が存在してはならない。

過去には `modes.realtime` / `theme.manual` / `deck.wallpaper` 等の一部設定が localStorage のみに存在しバックアップから漏れていたが、`settings.json` 統合によりこの漏れを解消する。環境依存データ (アカウントトークン / `accounts.json5`) のみが明示的に除外される (他環境での復元時に整合性を壊すため)。

### アプリ内バックアップ（設定メニュー）

設定メニューの「データ」セクションから以下の操作が可能:

| 操作 | 対象 | 形式 | 備考 |
|------|------|------|------|
| **DB エクスポート** | `notecli.db` | SQLite | アカウント・サーバー情報の完全バックアップ |
| **DB インポート** | `notecli.db` | SQLite | SQLiteヘッダ検証付き。インポート後アプリ再起動 |
| **設定エクスポート** | `settings.json` + テキストファイル群 | JSON | `settings.json` (スカラー preferences) + `profiles/` `themes/` `plugins/` `custom.css` をキー→値の JSON バンドルとして出力 |
| **設定インポート** | 同上 | JSON | パストラバーサル防止・ホワイトリスト検証付き。インポート後アプリ再起動 |

**セキュリティ:**
- DB インポート: SQLite マジックバイト（`SQLite format 3\0`）を検証。WAL/SHM ファイルも自動クリーンアップ
- 設定インポート: `..` や絶対パスを含むエントリを拒否。許可されたディレクトリ/ファイル名のみ展開

**統合済み**: `ai.json` / `keybinds.json5` / `performance.json` は `settings.json` に dual-write 統合済み。`export_settings_json` は旧ファイルも含めてバンドルしているが、`settings.json` に統合された値が source of truth となる。

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

NoteDeck の設定永続化は**複数段階の移行**を経てきている:

**Phase 1: localStorage → 個別ファイル** (実装済み)

1. 起動時に各設定ディレクトリのファイル存在を確認
2. ファイルが 0 件かつ localStorage にデータあり → テキストファイルとして書き出し
3. マイグレーション完了後、localStorage はキャッシュとして維持（削除しない）
4. 以降はファイルが source of truth

対象: プロファイル（`.ndprofile.json5`）、テーマ（`.ndtheme.json5`）、カスタムCSS（`custom.css`）、キーバインド（`keybinds.json5`）、プラグイン（`.is` + `.meta.json5`）、AI設定（`ai.json`）、パフォーマンス（`performance.json`）

**Phase 2: localStorage-only scalar → settings.json** (実装済み)

Phase 1 でファイル化されなかった localStorage-only 設定 (`theme.manual`, `modes.realtime`, `modes.offline`, `deck.wallpaper` 等) を `settings.json` に集約。

1. 起動時に `settings.json` が存在しなければデフォルト値で開始
2. ユーザーが設定を変更するたびに `settings.json` に debounce persist
3. 各ストアは `useSettingsStore` 経由で値を取得

**Phase 3: 個別 JSON ファイル → settings.json** (dual-write 統合済み)

`ai.json` / `keybinds.json5` / `performance.json` の内容を `settings.json` の namespace 付きキーに dual-write で統合済み:

- `ai.json` → `ai.*` キー
- `keybinds.json5` → `keybinds.*` キー
- `performance.json` → `performance.*` キー

旧ファイルは backward-compat として read-only でサポートを継続。新しい書き込みは `settings.json` に反映される。

**Phase 4: 恒久的に別ファイルとして残るもの** (統合しない)

以下は Misskey 互換性・コレクション性・特殊フォーマットの理由で恒久的に別ファイル:

- `themes/*.json5` (Misskey 互換)
- `plugins/*.is` + `*.meta.json5` (Misskey 互換)
- `profiles/*.ndprofile.json5` (NoteDeck 独自だが複数存在するコレクション)
- `custom.css` (CSS ファイル)
- `accounts.json5` (環境依存)

## ブラウザ・エディタパターンの導入方針

NoteDeck は Tauri（WebView）ベースのデスクトップアプリであり、Chrome / Vivaldi / VS Code 等の Electron / Chromium ベースアプリの UX パターンを積極的に取り入れる。以下は NoteDeck の既存概念とブラウザ・エディタの機能マッピング、および導入方針。

### 概念マッピング

| ブラウザ / エディタ | NoteDeck | 状態 |
|-------------------|----------|------|
| タブ | プロファイル（カラム配置のワークスペース） | 計画中 |
| タブタイリング (Vivaldi) | カラム横並び表示 | ✅ アプリの本質 |
| Web パネル (Vivaldi) | ナビバー（左サイドバー） | ✅ 実装済み |
| アドレスバー / オムニボックス | コマンドパレット (Ctrl+K) | ✅ 実装済み |
| 戻る / 進む | カラム間の履歴ナビゲーション | ✅ 実装済み |
| タブ検索 (Ctrl+Shift+A) | コマンドパレットでカラム検索 | ✅ 実装済み |
| 縦タブ (Edge / Vivaldi) | ナビバー（既に縦配置） | ✅ 実装済み |
| キーボードショートカット | カスタマイズ可能なキーバインド | ✅ 実装済み |
| Spaces (Arc) | プロファイル切替 | ✅ 実装済み（メニュー経由） |
| コマンドパレット (VS Code) | コマンドパレット | ✅ 実装済み |
| Explorer (VS Code) | Workspace Explorer カラム | ✅ 実装済み |
| Output パネル (VS Code) | Stream Inspector カラム | ✅ 実装済み |
| JSON Inspector (DevTools) | Raw JSON インスペクタウィンドウ | ✅ 実装済み |
| Settings Editor (VS Code) | settings.json Raw JSON エディタ | ✅ 実装済み |
| ブックマーク | お気に入り / クリップ | ✅ Misskey API 経由 |

### 階層構造

NoteDeck の UI は以下の階層で整理される。ブラウザ / エディタの概念と1対1で対応する:

```
┌─ Level 0: ウィンドウ（OS レベル）
│   = ブラウザウィンドウ / VS Code ウィンドウ
│
├─ Level 1: プロファイル（メニュー切替）
│   = 1ウィンドウ1プロファイル。メニューから切替
│
├─ Level 2: カラム（メインエリア横並び）
│   = Vivaldi タブタイリング / VS Code スプリットエディタ
│   1つのプロファイル内の複数ビュー
│
├─ Sidebar: ナビバー（左サイドバー）
│   = Vivaldi Web パネル / VS Code アクティビティバー
│   プロファイル切替を跨いで永続するショートカット
│
└─ Level 3: カラムタブ（ボトムバー）
    = Vivaldi タブスタック内のタブ一覧 / VS Code エディタグループ内タブ
    アクティブプロファイル内のカラム一覧
```

### A. ブレッドクラム（検討中）

**出典**: VS Code ブレッドクラム

既存の検索バーの URI 表示（`activeColumnUri`）をクリッカブルなブレッドクラムに発展:

```
[🔍 misskey.io > @taka > ホームTL          Ctrl+K]
     ↑クリック    ↑クリック   ↑クリック
```

各セグメントがクリッカブルで、サーバー一覧→アカウント切替→カラム種別切替と階層的にナビゲーション可能。

### B. Peek プレビュー（検討中）

**出典**: VS Code Peek Definition (Alt+F12)

ユーザー名やノートリンクのホバー/クリックで、カラム内にインラインプレビューを浮遊表示。スクロール位置を失わずにコンテキストを確認できる。

- ユーザー名ホバー → プロフィールカード + 最近のノート
- ノートリンク → ノート内容 + リプライツリーのプレビュー
- リノート元 → 元ノートのインライン表示

VS Code で最も評価される機能の一つ。SNS クライアントでは「スクロール位置を守る」価値が特に高い。

### C. Sticky Scroll（検討中）

**出典**: VS Code Sticky Scroll

スレッド表示で親ノートをカラム上部にスティッキーヘッダーとして固定。長い会話スレッドをスクロールしても、「何の話題か」を見失わない。

### D. リーディングリスト（検討中）

**出典**: Safari リーディングリスト

「後で読む」キューをローカル DB でサーバー横断管理。Misskey のお気に入り/クリップがサーバー単位なのに対し、全アカウントを横断して一元管理。ローカルにキャッシュすることでオフライン閲覧も可能。

### E. クロスサーバー統合検索（検討中）

**出典**: VS Code ワークスペース横断検索

全接続サーバーに並列クエリを送り、結果を統合表示。既存のコマンドパレット/検索バーを拡張する形で、「あのノート、どのサーバーで見たっけ？」を解決。ローカル FTS5 インデックスとの組み合わせで高速化。

### H. 統合通知センター（検討中）

全アカウントの通知を1箇所に集約するカラムタイプ。既存の cross-account 通知カラム（`accountId: null`）を発展させ、サーバー横断での未読管理・フィルタリングを実現。

### 導入しないパターン

| 機能 | 出典 | 不採用理由 |
|------|------|-----------|
| ミニマップ | VS Code / Sublime | テキストエディタ特有。タイムラインの俯瞰には不向き |
| Split Diff | VS Code | 2つのタイムライン比較は SNS の文脈で意味をなさない |
| リーダーモード | Safari / Firefox | SNS の短文には不要 |
| マウスジェスチャー | Vivaldi | 実装コストに対してリターンが少ない |
| スナップレイアウト | Edge / Windows 11 | プロファイルで代替可能 |
