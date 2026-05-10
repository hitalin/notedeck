/**
 * メモ間リンク (#494) のユーティリティ。
 *
 * `[name](memo:<id>)` 形式の標準 markdown link を解釈する補助関数群。
 * - 独自 syntax (`[[id]]`) は導入しない (Obsidian 等への portability 確保)
 * - id は `useMemos.generateMemoKey` 形式 (Zettelkasten = `YYYYMMDDHHmmss`)
 *
 * 設計:
 * - extractMemoRefs: text 中の link を抽出 (重複は1つに集約)
 * - findBacklinksTo: 指定 memo を参照しているメモを返す
 * - expandMemoRefs: 引用先メモを 1 階層展開 (budget cap で AI context 肥大化防止)
 */
import type { StoredMemo, StoredMemos } from '@/composables/useMemos'

/** Zettelkasten 形式 ID (`YYYYMMDDHHmmss` = 14 桁数字) を持つ memo: link を抽出する */
export function extractMemoRefs(text: string): string[] {
  if (!text) return []
  const re = /\]\(memo:(\d{14})\)/g
  const out = new Set<string>()
  for (const m of text.matchAll(re)) {
    out.add(m[1] as string)
  }
  return Array.from(out)
}

export interface MemoRef {
  /** memo を保存している account */
  accountId: string
  /** Zettelkasten id (memoKey) */
  memoKey: string
  memo: StoredMemo
}

/**
 * 指定 memoKey を参照している memo の一覧を返す (= backlinks)。
 * cross-account: 異なる account の memo からも参照され得るので、引数は
 * account 別 memos の Map で受ける。
 */
export function findBacklinksTo(
  targetMemoKey: string,
  allMemosByAccount: Map<string, StoredMemos>,
): MemoRef[] {
  const out: MemoRef[] = []
  for (const [accountId, memos] of allMemosByAccount) {
    for (const [memoKey, memo] of Object.entries(memos)) {
      if (memoKey === targetMemoKey) continue
      const refs = extractMemoRefs(memo.data.text)
      if (refs.includes(targetMemoKey)) {
        out.push({ accountId, memoKey, memo })
      }
    }
  }
  return out
}

/**
 * 引数 memos の各 text から memo: link を抽出し、リンク先 memo を 1 階層
 * (depth=1) 展開して返す。budget cap で件数を制限 (AI context 肥大化防止)。
 *
 * 入力 memos に既に含まれている memoKey や、`allMemosByAccount` に存在しない
 * dangling な参照は返さない。重複は除去。
 */
export function expandMemoRefs(
  memos: MemoRef[],
  allMemosByAccount: Map<string, StoredMemos>,
  budget = 5,
): MemoRef[] {
  const seen = new Set<string>()
  for (const m of memos) seen.add(m.memoKey)
  const out: MemoRef[] = []

  for (const m of memos) {
    if (out.length >= budget) break
    const refs = extractMemoRefs(m.memo.data.text)
    for (const ref of refs) {
      if (out.length >= budget) break
      if (seen.has(ref)) continue
      // 同 account を優先、なければ全 account から探す
      const sameAccount = allMemosByAccount.get(m.accountId)
      const sameMemo = sameAccount?.[ref]
      if (sameMemo) {
        out.push({ accountId: m.accountId, memoKey: ref, memo: sameMemo })
        seen.add(ref)
        continue
      }
      for (const [accountId, memos2] of allMemosByAccount) {
        if (accountId === m.accountId) continue
        const memo2 = memos2[ref]
        if (memo2) {
          out.push({ accountId, memoKey: ref, memo: memo2 })
          seen.add(ref)
          break
        }
      }
    }
  }

  return out
}
