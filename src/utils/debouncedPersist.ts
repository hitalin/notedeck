import { PERSIST_DEBOUNCE_MS } from '@/constants/persist'

export interface DebouncedPersist {
  /** debounce 付きで persist を予約する */
  schedule: () => void
  /**
   * ペンディング中の予約があれば即時 persist する (アプリ終了前など)。
   * 予約がなければ no-op。失敗は呼び出し元へ伝播する (onError は通らない)。
   */
  flush: () => Promise<void>
  /** ペンディング中の予約を破棄する */
  cancel: () => void
}

/**
 * debounce 付き永続化タイマーの共通実装。
 * 各ストアに重複していた「persistTimer + schedulePersist」パターンを吸収する。
 */
export interface KeyedDebouncedPersist<K> {
  /** key 単位の debounce 付きで persist を予約する */
  schedule: (key: K) => void
  /** 指定 key のペンディングがあれば即時 persist する。なければ no-op */
  flush: (key: K) => Promise<void>
  /** 指定 key のペンディングを破棄する */
  cancel: (key: K) => void
}

/**
 * key 単位の debounce 付き永続化タイマー。aiSessions のように
 * 「id ごとに独立したファイルへ書く」ストア用の keyed 版。
 */
export function createKeyedDebouncedPersist<K>(
  persist: (key: K) => void | Promise<void>,
  options: { delayMs?: number; onError?: (key: K, e: unknown) => void } = {},
): KeyedDebouncedPersist<K> {
  const { delayMs = PERSIST_DEBOUNCE_MS, onError } = options
  const timers = new Map<K, ReturnType<typeof setTimeout>>()

  function cancel(key: K): void {
    const timer = timers.get(key)
    if (timer != null) {
      clearTimeout(timer)
      timers.delete(key)
    }
  }

  function schedule(key: K): void {
    cancel(key)
    const timer = setTimeout(() => {
      timers.delete(key)
      try {
        const result = persist(key)
        if (result instanceof Promise) {
          result.catch((e) => onError?.(key, e))
        }
      } catch (e) {
        onError?.(key, e)
      }
    }, delayMs)
    timers.set(key, timer)
  }

  async function flush(key: K): Promise<void> {
    if (!timers.has(key)) return
    cancel(key)
    await persist(key)
  }

  return { schedule, flush, cancel }
}

export function createDebouncedPersist(
  persist: () => void | Promise<void>,
  options: { delayMs?: number; onError?: (e: unknown) => void } = {},
): DebouncedPersist {
  const { delayMs = PERSIST_DEBOUNCE_MS, onError } = options
  let timer: ReturnType<typeof setTimeout> | null = null

  function cancel(): void {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function schedule(): void {
    cancel()
    timer = setTimeout(() => {
      timer = null
      // 同期 persist は同期のまま実行する (マイクロタスク化すると fake timer
      // テストや beforeunload 直前の書き込みで取りこぼす)
      try {
        const result = persist()
        if (result instanceof Promise) result.catch((e) => onError?.(e))
      } catch (e) {
        onError?.(e)
      }
    }, delayMs)
  }

  async function flush(): Promise<void> {
    if (timer == null) return
    cancel()
    await persist()
  }

  return { schedule, flush, cancel }
}
