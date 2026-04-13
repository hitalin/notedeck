// 初回生成用テンプレ。TypeScript のテンプレートリテラル補間と衝突するので
// 全ての ${...} は \${...} でエスケープしている。
export const DEFAULT_AISCRIPT_SNIPPETS = `// AiScript スニペット — VSCode の *.code-snippets と同じスキーマ
// prefix: 補完トリガ文字列  body: 展開後のコード  description: 説明（任意）
// \${1:default} でタブストップ、$0 で終了位置。
{
  "Dialog": {
    "prefix": "dlg",
    "body": ["Mk:dialog(\\"$1\\", \\"\${2:message}\\")$0"],
    "description": "ダイアログを表示"
  },
  "For loop": {
    "prefix": "for",
    "body": ["for let \${1:i}, \${2:10} {", "\\t$0", "}"],
    "description": "for ループ"
  },
  "Each loop": {
    "prefix": "each",
    "body": ["each let \${1:item}, \${2:arr} {", "\\t$0", "}"],
    "description": "配列を each で走査"
  },
  "API call": {
    "prefix": "api",
    "body": ["Mk:api(\\"\${1:endpoint}\\", {$2})$0"],
    "description": "Misskey API 呼び出し"
  }
}
`
