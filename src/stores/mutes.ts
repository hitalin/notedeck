import { defineStore } from 'pinia'
import { shallowRef, triggerRef } from 'vue'
import type { MutedWord } from '@/bindings'
import { matchMutedWords } from '@/utils/wordMuteMatch'

/**
 * per-account の Set<string> reactive 状態。
 * shallowRef + triggerRef なのは、orderedIds の再代入を伴わず表示を更新する
 * 必要があるため（削除 tombstone の plain Set と違い reactive 必須）。
 */
function createAccountSet() {
  const byAccount = shallowRef(new Map<string, Set<string>>())

  function has(accountId: string, value: string | null | undefined): boolean {
    if (!value) return false
    return byAccount.value.get(accountId)?.has(value) ?? false
  }

  function add(accountId: string, value: string) {
    let set = byAccount.value.get(accountId)
    if (!set) {
      set = new Set()
      byAccount.value.set(accountId, set)
    }
    set.add(value)
    triggerRef(byAccount)
  }

  function remove(accountId: string, value: string) {
    byAccount.value.get(accountId)?.delete(value)
    triggerRef(byAccount)
  }

  /** サーバ同期。アカウントの集合を丸ごと置き換える。 */
  function replace(accountId: string, values: string[]) {
    byAccount.value.set(accountId, new Set(values))
    triggerRef(byAccount)
  }

  return { has, add, remove, replace }
}

interface AccountWordMutes {
  soft: MutedWord[]
  hard: MutedWord[]
}

/**
 * ミュート状態の per-account reactive ストア。
 * 表示述語 `useNoteVisibility().isHidden` の判定材料で、ミュート操作で状態が
 * 変わると全カラムの notes computed が再評価され、既に並んでいる過去ノートも
 * リロード無しで即時非表示になる（解除で復活）。
 *
 * - user (#574): muted userId の集合。mute/list から hydrate + 操作で更新
 * - renote (#614): リノートミュート。純粋リノート（renote && text===null）の
 *   リノート主で判定。renote-mute/list から hydrate
 * - instance (#613): ホスト名（`user.host`）の集合。Misskey `i` の
 *   mutedInstances から read のみで hydrate（NoteDeck からは編集しない）
 * - word (#610): mutedWords（soft = 折りたたみ）/ hardMutedWords（hard =
 *   完全非表示）。Misskey `i` から read のみで hydrate
 */
export const useMutesStore = defineStore('mutes', () => {
  const users = createAccountSet()
  const renoters = createAccountSet()
  const instances = createAccountSet()
  const words = shallowRef(new Map<string, AccountWordMutes>())

  // --- word mute ---

  /** `i` から取得した語句で account 分を置き換える（read 同期用）。 */
  function setMutedWords(
    accountId: string,
    soft: MutedWord[],
    hard: MutedWord[],
  ) {
    words.value.set(accountId, { soft, hard })
    triggerRef(words)
  }

  function matchesWord(
    kind: keyof AccountWordMutes,
    accountId: string | null | undefined,
    text: string | null | undefined,
  ): boolean {
    if (!accountId) return false
    const w = words.value.get(accountId)
    return w ? matchMutedWords(text, w[kind]) : false
  }

  return {
    // user mute
    isUserMuted: users.has,
    muteUser: users.add,
    unmuteUser: users.remove,
    setMutedUsers: users.replace,
    // renote mute
    isRenoteMuted: renoters.has,
    muteRenote: renoters.add,
    unmuteRenote: renoters.remove,
    setMutedRenoters: renoters.replace,
    // instance mute
    isInstanceMuted: instances.has,
    setMutedInstances: instances.replace,
    // word mute
    setMutedWords,
    /** hard ミュート（完全非表示）にマッチするか。 */
    matchesHardWord: (
      accountId: string | null | undefined,
      text: string | null | undefined,
    ) => matchesWord('hard', accountId, text),
    /** soft ミュート（折りたたみ表示）にマッチするか。 */
    matchesSoftWord: (
      accountId: string | null | undefined,
      text: string | null | undefined,
    ) => matchesWord('soft', accountId, text),
  }
})
