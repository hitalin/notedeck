import type { Command } from '@/commands/registry'
import { useAiSessionsStore } from '@/stores/aiSessions'

/**
 * AI Sessions 系 capability — 過去の AI 会話履歴へのアクセス。
 *
 * self-profile / learning-journal のような自己編集 skill が
 * 「自分が以前何を言ったか」「ユーザーと何を話したか」を振り返って
 * 自分の body を更新するときに使う。
 *
 * 機密性: AI session は本人の会話なので機密データではないが、
 * permission `ai.sessions.read` で明示的に管理する (= ai.json5 で off に
 * できる)。
 */

export const aiSessionsListCapability: Command = {
  id: 'ai.sessions.list',
  label: 'AI セッション一覧',
  icon: 'ti-messages',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: ['ai.sessions.read'],
  signature: {
    description:
      '保存されている AI セッションのメタ一覧 (updatedAt 降順) を返す。' +
      ' 各エントリは { id, kind, title, updatedAt, messageCount }。',
    params: {},
    returns: {
      type: 'array',
      description: 'AiSessionMeta の配列',
    },
    cheap: true,
  },
  visible: false,
  execute: async () => {
    const store = useAiSessionsStore()
    await store.loadAllMeta()
    return store.listSorted().map((m) => ({
      id: m.id,
      kind: m.kind,
      title: m.title,
      updatedAt: m.updatedAt,
      messageCount: m.messageCount,
    }))
  },
}

export const aiSessionsReadCapability: Command = {
  id: 'ai.sessions.read',
  label: 'AI セッションを読む',
  icon: 'ti-message-2',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: ['ai.sessions.read'],
  signature: {
    description: '指定 id の AI セッションのメッセージ列を返す。',
    params: {
      id: { type: 'string', description: '対象セッションの id' },
    },
    returns: {
      type: 'object',
      description: '{ id, kind, title, messages: [{ role, content }] }',
    },
    cheap: true,
  },
  visible: false,
  execute: async (params) => {
    const id = typeof params?.id === 'string' ? params.id : ''
    if (!id) throw new Error('ai.sessions.read: id is required')
    const store = useAiSessionsStore()
    await store.loadAllMeta()
    const session = store.get(id)
    if (!session) {
      throw new Error(`ai.sessions.read: session "${id}" not found`)
    }
    return {
      id: session.id,
      kind: session.kind,
      title: session.title,
      messages: session.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }
  },
}

export const aiSessionsSearchCapability: Command = {
  id: 'ai.sessions.search',
  label: 'AI セッション本文を検索',
  icon: 'ti-search',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: ['ai.sessions.read'],
  signature: {
    description:
      '保存されている AI セッションのメッセージ本文を全文 grep して、' +
      'ヒットしたセッションを id + 周辺 snippet で返す。大文字小文字を無視。',
    params: {
      query: { type: 'string', description: '検索クエリ (部分一致)' },
      limit: {
        type: 'number',
        description: '最大返却数 (default: 20)',
        optional: true,
      },
    },
    returns: {
      type: 'array',
      description: '[{ id, title, snippet }] の配列',
    },
    cheap: true,
  },
  visible: false,
  execute: async (params) => {
    const query = typeof params?.query === 'string' ? params.query : ''
    if (!query) throw new Error('ai.sessions.search: query is required')
    const limit =
      typeof params?.limit === 'number' && params.limit > 0 ? params.limit : 20
    const store = useAiSessionsStore()
    await store.loadAllMeta()
    const needle = query.toLowerCase()
    const results: { id: string; title: string; snippet: string }[] = []
    for (const meta of store.listSorted()) {
      if (results.length >= limit) break
      const session = store.get(meta.id)
      if (!session) continue
      for (const m of session.messages) {
        const hay = (m.content ?? '').toLowerCase()
        const idx = hay.indexOf(needle)
        if (idx >= 0) {
          const start = Math.max(0, idx - 40)
          const end = Math.min(m.content.length, idx + query.length + 40)
          const snippet =
            (start > 0 ? '…' : '') +
            m.content.slice(start, end) +
            (end < m.content.length ? '…' : '')
          results.push({ id: meta.id, title: meta.title, snippet })
          break
        }
      }
    }
    return results
  },
}

export const AI_SESSIONS_BUILTIN_CAPABILITIES: readonly Command[] = [
  aiSessionsListCapability,
  aiSessionsReadCapability,
  aiSessionsSearchCapability,
]
