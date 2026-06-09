/**
 * ワードミュート（mutedWords / hardMutedWords）の per-account ストア（#610）。
 *
 * `stores/mutes.ts`（userId ミュート）と同じ shallowRef + triggerRef パターン。
 * サーバ（Misskey `i`）から read のみで取得した語句を保持し、解除/変更時は
 * `setWords` の置き換え + triggerRef で参照側 computed が即再評価される。
 *
 * soft = `mutedWords`（隠して展開可）、hard = `hardMutedWords`（完全非表示）。
 */
import { defineStore } from 'pinia'
import { shallowRef, triggerRef } from 'vue'
import type { MutedWord } from '@/bindings'
import { matchMutedWords } from '@/utils/wordMuteMatch'

interface AccountWordMutes {
  soft: MutedWord[]
  hard: MutedWord[]
}

export const useWordMuteStore = defineStore('wordMutes', () => {
  const byAccount = shallowRef(new Map<string, AccountWordMutes>())

  /** `i` から取得した語句で account 分を置き換える（read 同期用）。 */
  function setWords(accountId: string, soft: MutedWord[], hard: MutedWord[]) {
    byAccount.value.set(accountId, { soft, hard })
    triggerRef(byAccount)
  }

  /** hard ミュート（完全非表示）にマッチするか。 */
  function matchesHard(
    accountId: string | null | undefined,
    text: string | null | undefined,
  ): boolean {
    if (!accountId) return false
    const w = byAccount.value.get(accountId)
    return w ? matchMutedWords(text, w.hard) : false
  }

  /** soft ミュート（折りたたみ表示）にマッチするか。 */
  function matchesSoft(
    accountId: string | null | undefined,
    text: string | null | undefined,
  ): boolean {
    if (!accountId) return false
    const w = byAccount.value.get(accountId)
    return w ? matchMutedWords(text, w.soft) : false
  }

  return { byAccount, setWords, matchesHard, matchesSoft }
})
