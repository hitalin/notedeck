import type { Command } from '@/commands/registry'
import { useThemeStore } from '@/stores/theme'

/**
 * `theme.list` — インストール済みテーマの一覧を返す。
 * AI が `theme.apply` で渡す ID を確認するために使う。
 */
export const themeListCapability: Command = {
  id: 'theme.list',
  label: 'テーマ一覧',
  icon: 'ti-palette',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: [],
  signature: {
    description:
      'インストール済みテーマの一覧を返す。各要素は { id, name, base, author }',
    params: {},
    returns: {
      type: 'array',
      description: 'インストール済みテーマ一覧',
    },
  },
  visible: false,
  execute: () => {
    const store = useThemeStore()
    return store.installedThemes.map((t) => ({
      id: t.id,
      name: t.name,
      base: t.base ?? null,
      // Misskey 互換 JSON には author が入るが MisskeyTheme 型には未宣言。
      // 値が存在すれば string として返す (なければ null)。
      author:
        typeof (t as unknown as { author?: unknown }).author === 'string'
          ? (t as unknown as { author: string }).author
          : null,
    }))
  },
}

/**
 * `theme.apply` — 指定 id のテーマを適用する。
 * テーマの `base` ('dark' | 'light') から適用先 mode を自動判定する。
 * `theme.list` で取得した id を渡す想定。
 */
export const themeApplyCapability: Command = {
  id: 'theme.apply',
  label: 'テーマを適用',
  icon: 'ti-palette',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: [],
  signature: {
    description:
      'インストール済みテーマを適用する。' +
      ' theme.list で id を取得してから呼ぶ。' +
      ' mode はテーマの base から自動判定 (省略可)。',
    params: {
      id: {
        type: 'string',
        description: '適用するテーマの id (theme.list で取得)',
      },
      mode: {
        type: 'string',
        description:
          '明示的に dark / light どちらの slot に適用するか。省略時はテーマ自体の base を使う',
        enum: ['dark', 'light'],
        optional: true,
      },
    },
    returns: {
      type: 'object',
      description: '`{ applied: boolean, id, mode }`',
    },
  },
  visible: false,
  execute: (params) => {
    const id = typeof params?.id === 'string' ? params.id : ''
    if (!id) throw new Error('theme.apply: id is required')
    const store = useThemeStore()
    const theme = store.installedThemes.find((t) => t.id === id)
    if (!theme) {
      throw new Error(`theme.apply: theme "${id}" is not installed`)
    }
    const explicitMode =
      params?.mode === 'dark' || params?.mode === 'light' ? params.mode : null
    const mode: 'dark' | 'light' =
      explicitMode ?? (theme.base === 'light' ? 'light' : 'dark')
    store.selectTheme(id, mode)
    return { applied: true, id, mode }
  },
}

export const THEME_BUILTIN_CAPABILITIES: readonly Command[] = [
  themeListCapability,
  themeApplyCapability,
]
