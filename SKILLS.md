# SKILLS — NoteDeck AI スキルリファレンス

NoteDeck の AI チャット機能で使う **SKILL (= Markdown 形式の指示書)** を書くための技術リファレンス。

> **入門ガイド・ベストプラクティス例集・配布手順** は misstore 側のドキュメント (近日公開予定) を参照してください。本書は NoteDeck コア仕様に対応する **API リファレンス** に近い性格です。

---

## 1. SKILL とは

- AI チャットの **system prompt に追加されるテキストフラグメント**
- AI の振る舞い・キャラ性・応答ガイドラインを Markdown で記述
- `~/.config/notedeck/skills/*.md` に置かれる (Linux の場合)
- 複数の SKILL は順に連結されて 1 つの system prompt になる
- misstore で配布可能 (Markdown 1 ファイル単位)

スキルは **AI に "読ませる"** 指示書であり、AI が "実行できる" 機能 (= **capability**) とは別物です。

| | スキル | Capability |
|---|---|---|
| 形式 | Markdown | TypeScript / AiScript コード |
| 役割 | AI への指示 (read-only) | AI が呼べる関数 (tool calling) |
| 配布 | misstore で配布 | builtin (NoteDeck 同梱) or AiScript プラグイン |
| 例 | 「丁寧に応答する」 | `time.now()` → ISO 8601 |

---

## 2. AI に渡される情報の全体像

AI チャットの 1 ターンで AI が受け取るのは:

```
[system prompt]
  ↓ skills/*.md の連結
  ↓ <notedeck-context> ブロック (AI 設定で許可された情報のみ)
  ↓
[history (messages 配列)]
  ↓ 過去の user / assistant ターン
  ↓
[最新の user message]
```

加えて、AI は **tools 配列** を介して任意の capability を呼び出せます (= 関数として実行)。tool 呼び出しの結果は次の AI ターンへ `tool_result` として返送されます。

---

## 3. AI が触れる context (毎ターン渡される)

system prompt 末尾に注入される `<notedeck-context>` ブロックの構造:

```xml
<notedeck-context>
  <currentAccount>{ ... }</currentAccount>
  <currentColumn>{ ... }</currentColumn>
  <visibleNotes|visibleNotifications|visibleDriveItems|visibleItems>[ ... ]</visibleNotes>
  <recentConversation>[ ... ]</recentConversation>
</notedeck-context>
```

各ブロックの中身は **AI 設定 (`ai.json5` の `dataSources`) でユーザーが許可したものだけ** 含まれます。

### 3.1 `<currentAccount>` (`dataSources.currentAccount`)

| フィールド | 型 | 例 |
|---|---|---|
| `id` | string | `acc-1` |
| `host` | string | `misskey.example` |
| `userId` | string | `9abc...` |
| `username` | string | `taka` |
| `displayName` | string \| null | `Taka` |
| `avatarUrl` | string \| null | URL |
| `software` | string | `misskey-dev/misskey` |
| `hasToken` | boolean | `true` |

**credential 系フィールドは自動的に除去**されます (詳細は §6)。

### 3.2 `<currentColumn>` (`dataSources.currentColumn`)

直近にフォーカスした **TIMELINE_LIKE 系** カラム (timeline / list / antenna / mentions / channel / favorites / clip / user / specified / search / role / chat) の情報。フォーカス未操作なら左端の TIMELINE_LIKE カラムを fallback として使用。

| フィールド | 型 |
|---|---|
| `id` | string |
| `type` | ColumnType |
| `name` | string \| null |
| `accountId` | string \| null |

### 3.3 `<visibleNotes>` / `<visibleNotifications>` / `<visibleDriveItems>` / `<visibleItems>` (`dataSources.visibleNotes`)

ブロック名は **column の type で自動分岐**:

| column type | ブロック名 |
|---|---|
| timeline / list / antenna / mentions / channel / favorites / clip / user / specified / search / role / chat | `<visibleNotes>` |
| notifications | `<visibleNotifications>` |
| drive | `<visibleDriveItems>` |
| その他 | `<visibleItems>` |

中身 (note projection の例):

```json
[
  { "id": "9abc", "userId": "u1", "username": "taka", "text": "hello", "createdAt": "..." },
  { "id": "9abd", "userId": "u2", "text": "[CW: spoiler]", ... }
]
```

- **上限 10 件** (`MAX_VISIBLE_NOTES`)
- CW 付きノートは `text` が `[CW: <理由>]` に置換される (本文は除外)
- 通知 / ドライブも各 kind ごとの projection で必要フィールドのみ抽出

### 3.4 `<recentConversation>` (`dataSources.recentConversation`)

直近 20 ターンの会話 (`MAX_RECENT_TURNS=20`)。

```json
[
  { "role": "user", "content": "今何時?" },
  { "role": "assistant", "content": "..." }
]
```

注: API への `messages` パラメータでも history は渡されるので、これは「テキスト形式の補助参照」として AI に再度提示する目的です (= 長い会話で AI が context を見失うのを防ぐ)。

---

## 4. AI が呼べる capability (= tool calling)

builtin として NoteDeck 同梱されているもの (Phase 2 A-5 時点):

| id | 機能 | 必要 permissions | 主要 params |
|---|---|---|---|
| `time.now` | 現在時刻 (ISO 8601) | (なし) | (なし) |
| `account.current` | active アカウント情報 | `account.read` | (なし) |
| `account.list` | 全アカウント一覧 | `account.read` | (なし) |
| `column.list` | デッキカラム一覧 | (なし) | (なし) |
| `column.add` | カラム追加 | (なし) | `type` (enum), `name?` |
| `theme.list` | インストール済みテーマ | (なし) | (なし) |
| `theme.apply` | テーマ適用 | (なし) | `id`, `mode? ('dark'\|'light')` |

### 4.1 capability の id 命名規則

- **`<subject>.<verb>` のドット区切り** (例: `notes.read`, `theme.apply`)
- AI に渡す tool name は Anthropic / OpenAI の制約 (`^[a-zA-Z0-9_-]{1,128}$`) に合わせて **`.` → `_`** に自動変換される (`time.now` → `time_now`)
- AI からの応答も sanitized name で来るが、dispatcher が逆引きするので意識不要

### 4.2 tool calling のループ

1. AI が `tool_use` (Anthropic) / `tool_calls` (OpenAI) を返す
2. NoteDeck は `dispatchCapability(name, params)` で実行 (permissions 照合 + execute)
3. 結果を **`tool_result` メッセージとして history に追加** + 続きの応答を AI から取得
4. **連続 tool 呼び出しの上限は 5 回** (`MAX_TOOL_ROUNDS=5`)、超えるとユーザー応答に警告メッセージ + 強制終了

### 4.3 dispatchCapability の戻り値

```ts
{ ok: true, result: <any> }
| { ok: false, code: 'unknown_capability', error: string }
| { ok: false, code: 'permission_denied', error: string }
| { ok: false, code: 'execute_failed', error: string }
```

AI には `tool_result` の `content` として文字列化された結果が返される (失敗時はエラー文字列)。

---

## 5. permissions スキーマ

AI 設定 (`ai.json5`) の `permissions.preset` と `permissions.custom` で表現:

| preset | readonly (default) | safe | full |
|---|---|---|---|
| `notes.read` / `account.read` / `drive.read` | ✓ | ✓ | ✓ |
| `notes.react` / `clipboard` / `notifications` | | ✓ | ✓ |
| `notes.write` / `account.write` / `drive.write` / `network.external` | | | ✓ |

- 全 10 項目: `notes.{read,write,react}` / `account.{read,write}` / `drive.{read,write}` / `network.external` / `clipboard` / `notifications`
- capability の `permissions: PermissionKey[]` 宣言と AI 設定を **AND 照合** で評価
- `safe` 以下では `notes.write` 等の write 系は自動的に `permission_denied`
- `custom` プリセットでは個別に on/off

### 5.1 高リスク権限

`notes.write` / `account.write` / `drive.write` / `network.external` は UI に warning アイコンで表示。Phase 5 で確認ダイアログによる enforcement が追加予定。

---

## 6. credential 自動マスキング

`<currentAccount>` や capability の戻り値に含まれる **credential 系フィールドは AI に渡る前に自動的に除去** されます。

### 除去されるキー (denylist)

```
token, i, accessToken, refreshToken, apiKey, password, secret
```

特に **`i` は Misskey の認証トークンキー** で、これが AI に流れると重大な情報漏洩になります。`stripCredentials()` が再帰的にすべてのオブジェクト・配列を walk して除去します。

### CW (Content Warning) のマスキング

CW 付きノートは `text` フィールドが `[CW: <理由>]` に置換され、本文は AI に届きません。AI は CW の存在と理由だけ認識できます。

---

## 7. SKILL の書き方 — 5 原則

### 1. AI の役割と口調を冒頭で固定

```markdown
あなたは Misskey クライアント NoteDeck の操作補助 AI です。
日本語で簡潔に応答してください。専門用語の濫用は避けてください。
```

### 2. データソースの優先順位を明示

context block (毎ターン渡される) と capability (明示的に呼ぶ) は使い分け:

```markdown
情報の取り方:
- 画面に見えているノートを参照するときは <visibleNotes> をまず見る
- アカウント情報は <currentAccount> をまず見る (capability を呼び直す必要なし)
- 「全アカウント」が必要な時だけ account.list を呼ぶ
```

→ context にあるものは tool で再取得させない (= 不要なラウンドトリップを防ぐ)。

### 3. 応答形式を厳密に指定

```markdown
応答フォーマット:
- 1 行目: 結論を 30 文字以内で
- 2 行目以降: Markdown 箇条書き、最大 5 項目
- 絵文字は控えめに (1 応答 1 個まで)
```

LLM は曖昧な指示で長文を返しがちなので、形式制約が効きます。

### 4. 失敗時のフォールバックを書く

```markdown
データが取れないときの挙動:
- <visibleNotes> が空 → 「画面に対象のノートがありません」
- tool が permission_denied → 「現在の権限設定では実行できません (AI 設定→権限を確認)」
- 不明な要求 → 推測せず提案で返す
```

### 5. 明示的に capability 名を書く

```markdown
テーマ変更を頼まれたら:
1. theme.list で id を取得
2. ユーザー指定の名前と一致するテーマの id を選ぶ
3. theme.apply(id) で適用
```

→ 「テーマを変えて」だけだと AI が `theme.apply` を呼ばずテキストだけで「変えました」と嘘応答するケースが防げます。

---

## 8. 例: 画面ノート要約スキル

```markdown
# 画面ノート要約スキル

ユーザーが「要約して」「まとめて」と言ったときの挙動:

1. <visibleNotes> ブロックを確認する
   - 空なら "画面にノートがありません。タイムラインカラムを開いてからもう一度お試しください" と返して終了
2. ノートがあれば 3 行で日本語要約:
   - 1 行目: "<件数> 件: <共通テーマ>"
   - 2 行目: 最も話題になっているノート 1 件 (`@username: 内容`)
   - 3 行目: トピック分布 (例: "技術 5 / 雑談 3 / 告知 2")
3. CW 付きノート ([CW: 理由]) は本文ではなく "(CW: <理由>)" として扱う
4. 100 文字を超える本文は 30 文字 + … で省略
5. 余計な前置きを書かない (「要約します」等は省く)

絶対やらないこと:
- "ノートを取得しています…" のような進捗報告
- 推測で内容を補完する (見えてない情報を作らない)
```

---

## 9. 例: テーマ切替スキル

```markdown
# テーマ切替スキル

ユーザーが「テーマを <名前> に変えて」「ダークにして」「明るくして」等と言ったとき:

1. theme.list で id 一覧を取得
2. ユーザー指定の名前と各テーマの name を fuzzy match
   - 完全一致 → そのテーマ
   - 部分一致 → 最初の候補 (複数あれば候補をリストして確認)
   - "ダーク" "明るく" 等の汎用語 → installed の中で該当 base のテーマ
3. theme.apply(id) で適用
4. "<テーマ名> を適用しました" と返す

失敗時:
- 該当 0 件 → "「<指定>」というテーマは見つかりません。インストール済み: <name 一覧>"
- match 複数 → "候補: <候補リスト>。どれにしますか?"
```

---

## 10. 制約 / Known Limits

| 項目 | 値 | 補足 |
|---|---|---|
| `<visibleNotes>` 上限 | 10 件 | `MAX_VISIBLE_NOTES` |
| `<recentConversation>` 上限 | 20 ターン | `MAX_RECENT_TURNS` |
| tool 呼び出しループ上限 | 5 回 | `MAX_TOOL_ROUNDS` |
| context block 全 OFF | 出力されない | `<notedeck-context>` タグごと省略 |
| 高リスク capability の enforcement | Phase 5 で確認ダイアログ | 現状は宣言だけ |
| AiScript プラグインからの capability 登録 | 未実装 | `Nd:register_command` 拡張は将来予定 |

---

## 11. 関連ドキュメント

- [DESIGN.md](DESIGN.md) — NoteDeck の設計判断 / アーキテクチャ
- [DEVELOPMENT.md](DEVELOPMENT.md) — 開発者向けガイド
- [#408](https://github.com/hitalin/notedeck/issues/408) — Capability Registry 設計議論

外部:
- misstore 入門ガイド (近日) — SKILL を書いて配布する手順
- [Anthropic tool use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use)
- [OpenAI function calling](https://platform.openai.com/docs/guides/function-calling)
