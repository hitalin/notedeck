import { type Ref, shallowRef } from 'vue'
import { AppError } from '@/utils/errors'

export interface UsePaginatedListOptions<T> {
  /** untilId なし = 初回ページ、あり = それより古いページを返す */
  fetch: (untilId?: string) => Promise<T[]>
  /**
   * 1 ページの期待件数。これ未満しか返らなければ hasMore=false で打ち切る。
   * 省略時は「空が返るまで続ける」(取得結果をフィルタする API 向け)。
   */
  pageSize?: number
  /** loadMore のカーソル取得。default: `item.id` */
  getId?: (item: T) => string
  /** 初回ロード後の hasMore 判定を上書きする (例: ページング非対応 API) */
  initialHasMore?: (fetched: T[]) => boolean
}

export interface PaginatedList<T> {
  items: Ref<T[]>
  isLoading: Ref<boolean>
  error: Ref<string | null>
  hasMore: Ref<boolean>
  /** 初回ロード。2 回目以降は no-op。失敗時は retry 可能 */
  load: () => Promise<void>
  /** 末尾の item をカーソルに次ページを追記 */
  loadMore: () => Promise<void>
  /** 状態を初期化して load し直せるようにする */
  reset: () => void
}

/**
 * untilId カーソル式ページングの共通実装。
 * UserProfileContent のタブや Deck*Column に重複していた
 * 「isLoading/hasMore ガード → at(-1) → fetch → 追記」パターンを吸収する。
 */
export function usePaginatedList<T>(
  options: UsePaginatedListOptions<T>,
): PaginatedList<T> {
  const { fetch, pageSize, initialHasMore } = options
  const getId = options.getId ?? ((item: T) => (item as { id: string }).id)

  const items = shallowRef<T[]>([])
  const isLoading = shallowRef(false)
  const error = shallowRef<string | null>(null)
  const hasMore = shallowRef(false)
  let loaded = false

  function defaultHasMore(fetched: T[]): boolean {
    return pageSize != null ? fetched.length >= pageSize : fetched.length > 0
  }

  async function load(): Promise<void> {
    if (loaded) return
    loaded = true
    isLoading.value = true
    error.value = null
    try {
      const fetched = await fetch(undefined)
      items.value = fetched
      hasMore.value = (initialHasMore ?? defaultHasMore)(fetched)
    } catch (e) {
      error.value = AppError.from(e).message
      loaded = false
    } finally {
      isLoading.value = false
    }
  }

  async function loadMore(): Promise<void> {
    if (isLoading.value || !hasMore.value) return
    const last = items.value.at(-1)
    if (!last) return
    isLoading.value = true
    try {
      const older = await fetch(getId(last))
      if (!defaultHasMore(older)) hasMore.value = false
      if (older.length > 0) {
        items.value = [...items.value, ...older]
      }
    } catch (e) {
      error.value = AppError.from(e).message
    } finally {
      isLoading.value = false
    }
  }

  function reset(): void {
    items.value = []
    isLoading.value = false
    error.value = null
    hasMore.value = false
    loaded = false
  }

  return { items, isLoading, error, hasMore, load, loadMore, reset }
}
