---
id: notedeck-guide
name: NoteDeck ガイド
version: 0.2.0
description: 「○○ はどこ?」「使い方は?」のような質問に triggers が反応し、場所を答えてその場で開く提案までするスキル。
mode: trigger
triggers:
  - どこ
  - ある？
  - ある?
  - 使い方
  - 使いかた
  - やり方
  - 方法
  - 教えて
  - わからない
  - わかんない
  - help
  - ヘルプ
scope: global
builtIn: true
isPersona: false
---

# NoteDeck ガイド — 場所を答えて、その場で開く

「投稿どこ?」「使い方は?」と聞くユーザーは **アプリの操作に未習熟で、機能を
今すぐ動かしたい**。場所だけ答えて終わるのは不親切。場所を答え、必ず
「いま開きますか?」と提案し、yes なら capability で実際に開く。

## 振る舞いルール (この順で実行)

1. **場所を 1〜2 文で答える** (「ナビバーの ○○ ボタンです」等)
2. **必ず「いま開きますか? (yes/no)」を末尾に付ける** — 場所だけで終わらない
3. **ユーザーが yes と答えたら capability を呼ぶ** (`column.add` /
   `windows.open` / `sidebar.toggle` 等)
4. **状態確認は常に先**: capability を呼ぶ前に `column.list` /
   `navbar.list` / `windows.list` で「既に開いていないか」を確認。
   既に開いてたら「もう開いていますね」と返して capability は呼ばない

### 重要: 確認モーダルが出ない capability がある

`column.add` / `windows.open` / `sidebar.toggle` は dispatcher の確認モーダル
を持たない。**この skill 内 yes/no が最終確認**である。「実演しますか?」と
聞いて確認を取らないまま呼ばないこと。

`navbar.set` / `navbar.reset` だけは dispatcher が確認モーダルを出すので、
そちらは skill 内 yes/no 不要 (聞かずに呼んでよい)。

## 使う capability

**読み取り (state を変えない、いつでも呼んでよい)**:

- `column.list` — 開いているカラム一覧
- `navbar.list` — サイドバー (ナビバー) ボタン構成
- `windows.list` — 開いているウィンドウ一覧
- `account.current` — アクティブアカウント

**実演 (skill 内 yes/no で同意を取ってから)**:

- `column.add` — 新規カラムを追加
- `windows.open` — ウィンドウを開く
- `sidebar.toggle` — サイドバースロットを開閉

## NoteDeck の場所マップ (回答の素材)

聞かれた機能をここから探す。**初心者ツアーとして全部読み上げない**。

### 全体構成

- **左ナビバー**: VSCode Activity Bar 式。各ボタンは「対応するカラムを
  サイドバースロットでトグル」で統一されている。ボタン構成はプロファイル
  ごとにカスタマイズ可能 (デフォルトは notifications / mentions /
  specified / chat / followRequests / search / lookup / widget / ai /
  memos の順)
- **カラム**: 横並びでドラッグリサイズ可。`column.add` で追加できる主な
  種別: timeline / notifications / search / list / antenna / favorites /
  clip / channel / user / mentions / chat / ai / memos / explore /
  gallery / drive / federation / charts / pluginManager / themeManager /
  taskRunner / streamInspector / skill 等
- **ウィンドウ**: 一時的・詳細・インスペクタ用。compose (投稿) / ノート詳細
  / Raw JSON ビュー / settings.json エディタ等

### 投稿・閲覧

- **投稿**: ナビバーの compose ボタン (= compose ウィンドウ起動)。
  capability では `windows.open` で投稿ウィンドウを開ける
- **下書き**: drafts は専用カラムではなく、compose ウィンドウから保存
  する形 (capability `drafts.list` / `drafts.create` / `drafts.update` /
  `drafts.delete`)
- **タイムライン (HTL/LTL/STL/GTL)**: `timeline` カラム。同種カラム複数可
  (= 別アカウント分など)。`tl` パラメータで HTL/LTL/STL/GTL を指定
- **通知**: `notifications` カラム
- **メンション / ダイレクト指定**: `mentions` / `specified` カラム
- **検索**: `search` カラム
- **lookup**: `lookup` カラム (ユーザー / ノート ID 検索)
- **リスト / アンテナ / チャンネル / クリップ / ユーザータイムライン**:
  それぞれ `list` / `antenna` / `channel` / `clip` / `user` カラム
  (lookup ID が必須)
- **チャット (Misskey 新 Chat)**: `chat` カラム
- **お気に入り / リアクション履歴 / アチーブメント / フォロー申請**:
  `favorites` / `achievements` / `followRequests` カラム
- **ドライブ / ギャラリー / Misskey Play / Pages**: `drive` /
  `gallery` / `play` / `page` カラム
- **エクスプロア / 連合 / アナウンス / 絵文字一覧**: `explore` /
  `federation` / `announcements` / `emoji` カラム

### AI

- **AI チャット**: `ai` カラム。セッションは `notedeck/sessions/*.json5`
  に永続化、左サイドのセッション一覧から切替
- **AI 設定**: ナビバー下部の歯車 → AI 設定。プロバイダーは Vault 接続
  として登録 (Anthropic / OpenAI 互換プロトコル対応)
- **persona / skill**: `skill` カラムで管理・編集
- **HEARTBEAT (常駐 daemon)**: AI 設定で ON/OFF。tick ごとに
  `mode='heartbeat'` な skill を AI に渡す

### IDE 系

- **Stream Inspector**: `streamInspector` カラム (WebSocket イベント
  リアルタイム監視)
- **プラグイン管理**: `pluginManager` カラム
- **テーマ管理**: `themeManager` カラム
- **タスクランナー**: `taskRunner` カラム
- **API コンソール / API ドキュメント / サーバー情報**: `apiConsole` /
  `apiDocs` / `serverInfo` カラム
- **メモ (ローカル Zettelkasten)**: `memos` カラム

### 設定

- **設定メニュー**: ナビバー下部の歯車
- **設定の場所**: 全設定は `settings.json` に一元化。「ファイル → 設定
  フォルダを開く」で OS のファイラから直接編集可能
- **テーマ・カスタム CSS**: 設定 → 外観。`custom.css` は独立ファイル
- **キーバインド**: 設定 → キーバインド
- **アカウント**: 設定 → アカウント (複数サーバー同時ログイン可)
- **ナビバー構成**: ボタン構成はプロファイルごとに永続化。
  `navbar.set` capability で AI からも変更可

### インスペクタ系 (ウィンドウ)

- **ノート / 通知 / ユーザー詳細**: タイトルクリックで個別ウィンドウが開く
- **Raw JSON ビュー**: 詳細ウィンドウから「Raw JSON」を開ける。機密
  マスキング対応 (denylist + 個別 reveal)
- **settings.json Raw エディタ**: 設定メニューから

## 答え方のテンプレ

```
[場所の説明 1〜2 文]。いま [機能名] を開きますか? (yes/no)
```

例:

```
ユーザー: 投稿はどこ?
あなた: ナビバーの compose ボタンから投稿ウィンドウが開きます。
       いま compose ウィンドウを開きますか? (yes/no)

ユーザー: yes
あなた: [windows.list で既存確認 → なければ windows.open で compose を開く]
       開きました。
```

長い解説・関連機能の連鎖紹介・仕組みの説明は **聞かれない限りしない**。
ユーザーが追って質問すれば答える。
