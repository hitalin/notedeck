import { relaunch } from '@tauri-apps/plugin-process'
import { refreshProfileCommands } from '@/commands/definitions'
import { COLUMN_ICONS, COLUMN_LABELS } from '@/composables/useColumnTabs'
import { switchProfileWithWindows } from '@/composables/useDeckWindow'
import {
  getAccountLabel,
  isGuestAccount,
  useAccountsStore,
} from '@/stores/accounts'
import { useConfirm } from '@/stores/confirm'
import type { ColumnType, DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useDeckProfileStore } from '@/stores/deckProfile'
import { useThemeStore } from '@/stores/theme'
import { useWindowsStore } from '@/stores/windows'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'
import { showLoginPrompt } from '@/utils/loginPrompt'
import { invoke } from '@/utils/tauriInvoke'
import type { QuickPickItem } from './quickPick'
import { useCommandStore } from './registry'

// ============================================================
// Settings (Phase 2)
// ============================================================

export function getSettingsItems(): QuickPickItem[] {
  return [
    // Appearance
    {
      id: 'toggle-dark-mode',
      label: 'ダーク / ライトモード切替',
      icon: 'moon',
      group: 'アピアランス',
      action: () => useThemeStore().toggleTheme(),
    },
    {
      id: 'toggle-os-theme-sync',
      label: 'デバイスのダークモードに同期',
      icon: 'device-desktop',
      group: 'アピアランス',
      description: useThemeStore().manualMode == null ? 'オン' : 'オフ',
      action: () => {
        const themeStore = useThemeStore()
        if (themeStore.manualMode == null) {
          themeStore.pinCurrentMode()
        } else {
          themeStore.resetToOsTheme()
        }
      },
    },
    {
      id: 'select-dark-theme',
      label: 'ダークテーマで使うテーマ',
      icon: 'moon',
      group: 'アピアランス',
      children: () => getThemeSelectItems('dark'),
    },
    {
      id: 'select-light-theme',
      label: 'ライトテーマで使うテーマ',
      icon: 'sun',
      group: 'アピアランス',
      children: () => getThemeSelectItems('light'),
    },
    {
      id: 'theme-editor',
      label: 'テーマエディタ',
      icon: 'palette',
      group: 'アピアランス',
      action: () => useWindowsStore().open('themeEditor'),
    },
    {
      id: 'css-editor',
      label: 'カスタムCSS',
      icon: 'code',
      group: 'アピアランス',
      action: () => useWindowsStore().open('cssEditor'),
    },
    {
      id: 'set-wallpaper',
      label: '壁紙を設定',
      icon: 'photo',
      group: 'アピアランス',
      action: () => pickWallpaperFile(),
    },
    {
      id: 'remove-wallpaper',
      label: '壁紙を削除',
      icon: 'photo-off',
      group: 'アピアランス',
      action: () => useDeckStore().clearWallpaper(),
    },
    // Settings
    {
      id: 'plugins',
      label: 'プラグイン',
      icon: 'plug',
      group: '設定',
      action: () => useWindowsStore().open('plugins'),
    },
    {
      id: 'ai-settings',
      label: 'AI設定',
      icon: 'sparkles',
      group: '設定',
      action: () => useWindowsStore().open('aiSettings'),
    },
    {
      id: 'keybinds',
      label: 'キーバインド',
      icon: 'keyboard',
      group: '設定',
      action: () => useWindowsStore().open('keybinds'),
    },
    {
      id: 'performance',
      label: 'パフォーマンス',
      icon: 'gauge',
      group: '設定',
      action: () => useWindowsStore().open('performanceEditor'),
    },
    // Backup
    {
      id: 'export-db',
      label: 'DBエクスポート',
      icon: 'database-export',
      group: 'バックアップ',
      action: () => invoke('export_db'),
    },
    {
      id: 'import-db',
      label: 'DBインポート',
      icon: 'database-import',
      group: 'バックアップ',
      action: () =>
        backupWithConfirm(
          'import_db',
          'DBインポート',
          '現在のDBが上書きされます。',
        ),
    },
    {
      id: 'export-settings',
      label: '設定エクスポート',
      icon: 'file-export',
      group: 'バックアップ',
      action: () => invoke('export_settings_json'),
    },
    {
      id: 'import-settings',
      label: '設定インポート',
      icon: 'file-import',
      group: 'バックアップ',
      action: () =>
        backupWithConfirm(
          'import_settings_json',
          '設定インポート',
          '現在の設定が上書きされます。',
        ),
    },
  ]
}

function pickWallpaperFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = () => {
    const file = input.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => useDeckStore().setWallpaper(reader.result as string)
    reader.readAsDataURL(file)
  }
  input.click()
}

async function backupWithConfirm(
  command: string,
  title: string,
  message: string,
) {
  const { confirm } = useConfirm()
  const ok = await confirm({
    title,
    message,
    okLabel: 'インポート',
    type: 'danger',
  })
  if (!ok) return
  const result = await invoke<boolean>(command)
  if (result) await relaunch()
}

function getThemeSelectItems(mode: 'dark' | 'light'): QuickPickItem[] {
  const themeStore = useThemeStore()
  const builtin = mode === 'dark' ? DARK_THEME : LIGHT_THEME
  const selectedId =
    mode === 'dark'
      ? themeStore.selectedDarkThemeId
      : themeStore.selectedLightThemeId
  const installed = themeStore.installedThemes.filter((t) => t.base === mode)

  const items: QuickPickItem[] = [
    {
      id: 'theme-builtin',
      label: builtin.name,
      icon: mode === 'dark' ? 'moon' : 'sun',
      description: selectedId == null ? '選択中' : undefined,
      action: () => themeStore.selectTheme(null, mode),
    },
  ]

  for (const theme of installed) {
    items.push({
      id: `theme-${theme.id}`,
      label: theme.name,
      icon: mode === 'dark' ? 'moon' : 'sun',
      description: selectedId === theme.id ? '選択中' : undefined,
      action: () => themeStore.selectTheme(theme.id, mode),
    })
  }

  return items
}

// ============================================================
// Profiles (Phase 3)
// ============================================================

export function getProfileItems(): QuickPickItem[] {
  const profileStore = useDeckProfileStore()
  const deckStore = useDeckStore()
  const profiles = profileStore.getProfiles()
  const activeId = deckStore.activeProfileId

  const items: QuickPickItem[] = profiles.map((p) => ({
    id: `profile-${p.id}`,
    label: p.name,
    icon: 'layout',
    description: p.id === activeId ? '現在のプロファイル' : undefined,
    children: () => getProfileActions(p.id, p.id === activeId),
  }))

  items.push({
    id: 'profile-new',
    label: '新規プロファイル作成',
    icon: 'plus',
    action: () => {
      deckStore.saveAsProfile()
      refreshProfileCommands()
    },
  })

  return items
}

function getProfileActions(
  profileId: string,
  isActive: boolean,
): QuickPickItem[] {
  const items: QuickPickItem[] = []

  if (!isActive) {
    items.push({
      id: `profile-switch-${profileId}`,
      label: '切替',
      icon: 'switch-horizontal',
      action: () => switchProfileWithWindows(profileId),
    })
  }

  items.push({
    id: `profile-edit-${profileId}`,
    label: '編集',
    icon: 'edit',
    action: () => useWindowsStore().open('profileEditor', { profileId }),
  })

  if (!isActive) {
    items.push({
      id: `profile-delete-${profileId}`,
      label: '削除',
      icon: 'trash',
      action: async () => {
        const { confirm } = useConfirm()
        const ok = await confirm({
          title: 'プロファイルを削除',
          message: 'このプロファイルを削除しますか？',
          okLabel: '削除',
          type: 'danger',
        })
        if (!ok) return
        useDeckStore().deleteProfile(profileId)
        refreshProfileCommands()
      },
    })
  }

  return items
}

// ============================================================
// Add Column (Phase 4)
// ============================================================

const GUEST_ALLOWED_TYPES = new Set<ColumnType>([
  'timeline',
  'user',
  'search',
  'channel',
  'explore',
  'emoji',
  'announcements',
  'gallery',
  'serverInfo',
  'aboutMisskey',
  'ads',
  'lookup',
  'play',
  'page',
])

const CROSS_ACCOUNT_TYPES = new Set<ColumnType>([
  'notifications',
  'search',
  'chat',
  'mentions',
  'specified',
  'followRequests',
])

interface ColumnTypeDef {
  type: ColumnType
  label: string
  icon: string
  group: string
}

const COLUMN_TYPE_DEFS: ColumnTypeDef[] = [
  // Account
  {
    type: 'timeline',
    label: 'タイムライン',
    icon: 'home',
    group: 'アカウント',
  },
  { type: 'notifications', label: '通知', icon: 'bell', group: 'アカウント' },
  { type: 'drive', label: 'ドライブ', icon: 'cloud', group: 'アカウント' },
  {
    type: 'followRequests',
    label: 'フォローリクエスト',
    icon: 'user-plus',
    group: 'アカウント',
  },
  { type: 'list', label: 'リスト', icon: 'list', group: 'アカウント' },
  {
    type: 'antenna',
    label: 'アンテナ',
    icon: 'antenna-bars-5',
    group: 'アカウント',
  },
  { type: 'favorites', label: 'お気に入り', icon: 'star', group: 'アカウント' },
  { type: 'clip', label: 'クリップ', icon: 'paperclip', group: 'アカウント' },
  { type: 'mentions', label: 'メンション', icon: 'at', group: 'アカウント' },
  { type: 'specified', label: 'ダイレクト', icon: 'mail', group: 'アカウント' },
  { type: 'chat', label: 'チャット', icon: 'messages', group: 'アカウント' },
  { type: 'achievements', label: '実績', icon: 'medal', group: 'アカウント' },
  // Server
  {
    type: 'serverInfo',
    label: 'サーバー情報',
    icon: 'server',
    group: 'サーバー',
  },
  {
    type: 'aboutMisskey',
    label: 'Misskeyについて',
    icon: 'info-circle',
    group: 'サーバー',
  },
  {
    type: 'emoji',
    label: 'カスタム絵文字',
    icon: 'mood-smile',
    group: 'サーバー',
  },
  { type: 'ads', label: '広告', icon: 'ad-2', group: 'サーバー' },
  { type: 'explore', label: 'みつける', icon: 'compass', group: 'サーバー' },
  {
    type: 'announcements',
    label: 'お知らせ',
    icon: 'speakerphone',
    group: 'サーバー',
  },
  { type: 'search', label: '検索', icon: 'search', group: 'サーバー' },
  { type: 'lookup', label: 'URI照会', icon: 'world-search', group: 'サーバー' },
  {
    type: 'channel',
    label: 'チャンネル',
    icon: 'device-tv',
    group: 'サーバー',
  },
  { type: 'gallery', label: 'ギャラリー', icon: 'icons', group: 'サーバー' },
  {
    type: 'play',
    label: 'Misskey Play',
    icon: 'player-play',
    group: 'サーバー',
  },
  { type: 'page', label: 'ページ', icon: 'note', group: 'サーバー' },
  { type: 'user', label: 'ユーザー', icon: 'user', group: 'サーバー' },
  // Tools
  {
    type: 'widget',
    label: 'ウィジェット',
    icon: 'app-window',
    group: 'ツール',
  },
  {
    type: 'aiscript',
    label: 'スクラッチパッド',
    icon: 'terminal-2',
    group: 'ツール',
  },
  { type: 'apiConsole', label: 'APIコンソール', icon: 'api', group: 'ツール' },
  { type: 'apiDocs', label: 'APIドキュメント', icon: 'book', group: 'ツール' },
  { type: 'ai', label: 'AIチャット', icon: 'sparkles', group: 'ツール' },
]

const COLUMN_EXTRA_PROPS: Partial<
  Record<ColumnType, Partial<Omit<DeckColumn, 'id'>>>
> = {
  widget: { widgets: [] },
  aiscript: { aiscriptCode: '<: "Hello, AiScript!"' },
  apiDocs: { accountId: null, width: 990 },
  timeline: { tl: 'home', name: null },
}

interface SelectableConfig {
  type: ColumnType
  apiCommand: string
  idKey: string
}

const SELECTABLE_CONFIGS: SelectableConfig[] = [
  { type: 'list', apiCommand: 'api_get_user_lists', idKey: 'listId' },
  { type: 'antenna', apiCommand: 'api_get_antennas', idKey: 'antennaId' },
  { type: 'channel', apiCommand: 'api_get_channels', idKey: 'channelId' },
  { type: 'clip', apiCommand: 'api_get_clips', idKey: 'clipId' },
]

export function getColumnTypeItems(): QuickPickItem[] {
  return COLUMN_TYPE_DEFS.map((def) => ({
    id: `col-${def.type}`,
    label: def.label,
    icon: def.icon,
    group: def.group,
    children: () => buildAccountStep(def.type),
  }))
}

function buildAccountStep(type: ColumnType): QuickPickItem[] {
  const accountsStore = useAccountsStore()

  // apiDocs: account-independent
  if (type === 'apiDocs') {
    finalizeAddColumn(type, null)
    return []
  }

  const authRequired = !GUEST_ALLOWED_TYPES.has(type)
  const accounts = accountsStore.accounts.filter(
    (a) => !(authRequired && isGuestAccount(a)),
  )

  // Single account: auto-select
  const account = accounts[0]
  if (accounts.length === 1 && account) {
    if (!account.hasToken && authRequired) {
      showLoginPrompt()
      return []
    }
    return buildDetailStep(type, account.id)
  }

  // Multiple accounts: show selection
  const items: QuickPickItem[] = []

  if (CROSS_ACCOUNT_TYPES.has(type)) {
    items.push({
      id: 'account-all',
      label: '全アカウント',
      icon: 'users',
      children: () => buildDetailStep(type, null),
    })
  }

  for (const account of accounts) {
    items.push({
      id: `account-${account.id}`,
      label: getAccountLabel(account),
      icon: 'user',
      children: () => {
        if (!account.hasToken && authRequired) {
          showLoginPrompt()
          return []
        }
        return buildDetailStep(type, account.id)
      },
    })
  }

  return items
}

function buildDetailStep(
  type: ColumnType,
  accountId: string | null,
): QuickPickItem[] {
  const config = SELECTABLE_CONFIGS.find((c) => c.type === type)

  if (config && accountId) {
    // Return a loading placeholder — will be replaced by async children
    return [
      {
        id: 'loading-trigger',
        label: `${COLUMN_LABELS[type] ?? type}を読み込み中...`,
        icon: COLUMN_ICONS[type] ?? 'dots',
        children: async () => {
          const items = await invoke<{ id: string; name: string }[]>(
            config.apiCommand,
            { accountId },
          )
          return items.map((item) => ({
            id: `select-${item.id}`,
            label: item.name,
            icon: COLUMN_ICONS[type] ?? 'dots',
            action: () => {
              useDeckStore().addColumn({
                type,
                name: item.name,
                width: 360,
                accountId,
                [config.idKey]: item.id,
                active: true,
              } as Omit<DeckColumn, 'id'>)
            },
          }))
        },
      },
    ]
  }

  // TODO: user type needs text input — for now fallback to direct column add
  // Direct finalization for non-selectable types
  finalizeAddColumn(type, accountId)
  return []
}

function finalizeAddColumn(type: ColumnType, accountId: string | null) {
  const extra = COLUMN_EXTRA_PROPS[type]
  useDeckStore().addColumn({
    type,
    name: COLUMN_LABELS[type] ?? type,
    width: 360,
    accountId,
    active: true,
    ...extra,
  } as Omit<DeckColumn, 'id'>)
  useCommandStore().close()
}
