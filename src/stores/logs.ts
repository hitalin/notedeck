import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * アプリ内ログ集約 (in-memory リング、最大 200 件)。
 *
 * `console.warn` / `console.error` / `window.onerror` / `unhandledrejection` を
 * App 起動時にラップしてここに push する。capability `logs.recent` から AI が
 * 自分用のエラー状況を取得して、自己修正に使う。
 *
 * 機密注意: ユーザー自身のローカルログなので privacy 問題は薄いが、scope
 * prefix が `[ai-credentials]` のような明示的に機密扱いのものは除外する
 * (実装は App.vue 側で skip 判定)。
 */

export type LogLevel = 'warn' | 'error'

export interface LogEntry {
  /** Unix ms */
  at: number
  level: LogLevel
  /** `[plugins] ...` のような prefix から抽出した scope (なければ undefined) */
  scope?: string
  /** メッセージ本文 (引数を JSON.stringify or String() で結合) */
  message: string
}

const RING_SIZE = 200
const SCOPE_RE = /^\[([a-z0-9_-]+)\]\s+/i

export const useLogsStore = defineStore('logs', () => {
  const entries = ref<LogEntry[]>([])

  function push(level: LogLevel, args: unknown[]) {
    const message = args
      .map((a) => {
        if (typeof a === 'string') return a
        if (a instanceof Error) return a.message
        try {
          return JSON.stringify(a)
        } catch {
          return String(a)
        }
      })
      .join(' ')
    const m = message.match(SCOPE_RE)
    const scope = m?.[1]
    const entry: LogEntry = {
      at: Date.now(),
      level,
      message: scope ? message.slice(m[0].length) : message,
      ...(scope ? { scope } : {}),
    }
    entries.value = [entry, ...entries.value].slice(0, RING_SIZE)
  }

  function recent(level: LogLevel | 'all' = 'error', limit = 20): LogEntry[] {
    const filtered =
      level === 'all'
        ? entries.value
        : entries.value.filter((e) => e.level === level)
    return filtered.slice(0, Math.max(1, Math.min(limit, RING_SIZE)))
  }

  function clear() {
    entries.value = []
  }

  return { entries, push, recent, clear }
})
