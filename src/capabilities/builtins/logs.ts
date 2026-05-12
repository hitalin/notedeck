import type { Command } from '@/commands/registry'
import { type LogLevel, useLogsStore } from '@/stores/logs'

/**
 * `logs.recent` — アプリ内 console.warn / console.error の最近のログを返す。
 * AI が自己修正・診断に使う (= 「最近のエラー教えて」が動く)。
 */
export const logsRecentCapability: Command = {
  id: 'logs.recent',
  label: '最近のログを取得',
  icon: 'ti-bug',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: ['logs.read'],
  signature: {
    description:
      'アプリ内 console.warn / console.error のリング (最大 200 件) から' +
      ' 直近を返す。AI が自己修正・診断に使う。',
    params: {
      level: {
        type: 'string',
        description: '"warn" | "error" | "all" (default: "error")',
        enum: ['warn', 'error', 'all'],
        optional: true,
      },
      limit: {
        type: 'number',
        description: '最大返却数 (default: 20)',
        optional: true,
      },
    },
    returns: {
      type: 'array',
      description: '{ at, level, scope?, message } の配列 (新しい順)',
    },
    cheap: true,
  },
  visible: false,
  execute: (params) => {
    const levelParam =
      typeof params?.level === 'string' ? params.level : 'error'
    const level: LogLevel | 'all' =
      levelParam === 'warn' || levelParam === 'all'
        ? (levelParam as LogLevel | 'all')
        : 'error'
    const limit = typeof params?.limit === 'number' ? params.limit : 20
    const store = useLogsStore()
    return store.recent(level, limit)
  },
}

export const LOGS_BUILTIN_CAPABILITIES: readonly Command[] = [
  logsRecentCapability,
]
