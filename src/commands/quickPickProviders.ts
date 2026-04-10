import { relaunch } from '@tauri-apps/plugin-process'
import { reactive } from 'vue'
import { refreshProfileCommands } from '@/commands/definitions'
import { COLUMN_ICONS, COLUMN_LABELS } from '@/composables/useColumnTabs'
import { switchProfileWithWindows } from '@/composables/useDeckWindow'
import { formatUserHandle, searchUsers } from '@/composables/useUserSearch'
import {
  getAccountAvatarUrl,
  getAccountLabel,
  isGuestAccount,
  useAccountsStore,
} from '@/stores/accounts'
import { useConfirm } from '@/stores/confirm'
import type { ColumnType, DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useDeckProfileStore } from '@/stores/deckProfile'
import { usePrompt } from '@/stores/prompt'
import { useThemeStore } from '@/stores/theme'
import { useWindowsStore } from '@/stores/windows'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'
import { proxyThumbUrl } from '@/utils/imageProxy'
import { showLoginPrompt } from '@/utils/loginPrompt'
import { commands, unwrap } from '@/utils/tauriInvoke'
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
    // Data
    {
      id: 'clear-all-cache',
      label: '全キャッシュ削除',
      icon: 'eraser',
      group: 'データ',
      action: async () => {
        const { confirm } = useConfirm()
        const ok = await confirm({
          title: 'キャッシュ削除',
          message: 'ノートキャッシュとOGPキャッシュをすべて削除しますか？',
          okLabel: '削除',
          type: 'danger',
        })
        if (ok) unwrap(await commands.clearAllCache())
      },
    },
    {
      id: 'export-db',
      label: 'DBエクスポート',
      icon: 'database-export',
      group: 'データ',
      action: async () => {
        unwrap(await commands.exportDb())
      },
    },
    {
      id: 'import-db',
      label: 'DBインポート',
      icon: 'database-import',
      group: 'データ',
      action: () =>
        backupWithConfirm(
          'importDb',
          'DBインポート',
          '現在のDBが上書きされます。',
        ),
    },
    {
      id: 'export-settings',
      label: '設定エクスポート',
      icon: 'file-export',
      group: 'データ',
      action: async () => {
        unwrap(await commands.exportSettingsJson())
      },
    },
    {
      id: 'import-settings',
      label: '設定インポート',
      icon: 'file-import',
      group: 'データ',
      action: () =>
        backupWithConfirm(
          'importSettingsJson',
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
  command: 'importDb' | 'importSettingsJson',
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
  const result = unwrap(await commands[command]())
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
  'widget',
  'aiscript',
])

const CROSS_ACCOUNT_TYPES = new Set<ColumnType>([
  'notifications',
  'search',
  'chat',
  'mentions',
  'specified',
  'followRequests',
  'lookup',
])

const ACCOUNT_OPTIONAL_TYPES = new Set<ColumnType>(['widget', 'aiscript'])

/** カラムタイプの表示順とグループ定義。label/icon は COLUMN_LABELS/COLUMN_ICONS から取得 */
const COLUMN_TYPE_GROUPS: { group: string; types: ColumnType[] }[] = [
  {
    group: 'アカウント',
    types: [
      'timeline',
      'notifications',
      'drive',
      'followRequests',
      'list',
      'antenna',
      'favorites',
      'clip',
      'mentions',
      'specified',
      'chat',
      'achievements',
    ],
  },
  {
    group: 'サーバー',
    types: [
      'serverInfo',
      'aboutMisskey',
      'emoji',
      'ads',
      'explore',
      'announcements',
      'search',
      'lookup',
      'channel',
      'gallery',
      'play',
      'page',
      'user',
    ],
  },
  {
    group: 'ツール',
    types: [
      'widget',
      'aiscript',
      'apiConsole',
      'apiDocs',
      'ai',
      'streamInspector',
    ],
  },
]

const COLUMN_EXTRA_PROPS: Partial<
  Record<ColumnType, Partial<Omit<DeckColumn, 'id'>>>
> = {
  widget: { widgets: [] },
  aiscript: { aiscriptCode: '<: "Hello, AiScript!"' },
  apiDocs: { accountId: null, width: 990 },
  ai: { accountId: null },
  streamInspector: { accountId: null },
  timeline: { tl: 'home', name: null },
}

interface SelectableConfig {
  type: ColumnType
  apiCommand: string
  idKey: string
  searchCommand?: string
  /** Misskey API endpoint for creating new items */
  createEndpoint?: string
  /** Default params to merge when creating */
  createDefaults?: Record<string, unknown>
}

const SELECTABLE_CONFIGS: SelectableConfig[] = [
  {
    type: 'list',
    apiCommand: 'apiGetUserLists',
    idKey: 'listId',
    createEndpoint: 'users/lists/create',
  },
  {
    type: 'antenna',
    apiCommand: 'apiGetAntennas',
    idKey: 'antennaId',
    createEndpoint: 'antennas/create',
    createDefaults: {
      src: 'all',
      keywords: [['']],
      excludeKeywords: [['']],
      users: [],
      caseSensitive: false,
      withReplies: false,
      withFile: false,
    },
  },
  {
    type: 'channel',
    apiCommand: 'apiGetChannels',
    idKey: 'channelId',
    searchCommand: 'apiSearchChannels',
  },
  {
    type: 'clip',
    apiCommand: 'apiGetClips',
    idKey: 'clipId',
    createEndpoint: 'clips/create',
  },
]

type ListCommand =
  | 'apiGetUserLists'
  | 'apiGetAntennas'
  | 'apiGetChannels'
  | 'apiGetClips'
  | 'apiSearchChannels'

async function invokeListCommand(
  command: string,
  accountId: string,
  query?: string,
): Promise<{ id: string; name: string }[]> {
  switch (command as ListCommand) {
    case 'apiGetUserLists':
      return unwrap(await commands.apiGetUserLists(accountId))
    case 'apiGetAntennas':
      return unwrap(await commands.apiGetAntennas(accountId))
    case 'apiGetChannels':
      return unwrap(await commands.apiGetChannels(accountId))
    case 'apiGetClips':
      return unwrap(await commands.apiGetClips(accountId))
    case 'apiSearchChannels':
      return unwrap(await commands.apiSearchChannels(accountId, query ?? ''))
    default:
      return []
  }
}

export function getColumnTypeItems(): QuickPickItem[] {
  return COLUMN_TYPE_GROUPS.flatMap(({ group, types }) =>
    types.map((type) => ({
      id: `col-${type}`,
      label: COLUMN_LABELS[type] ?? type,
      icon: COLUMN_ICONS[type] ?? 'dots',
      group,
      children: () => buildAccountStep(type),
    })),
  )
}

async function buildAccountStep(type: ColumnType): Promise<QuickPickItem[]> {
  const accountsStore = useAccountsStore()

  // Account-independent types: skip account selection
  if (type === 'apiDocs' || type === 'ai' || type === 'streamInspector') {
    finalizeAddColumn(type, null)
    return []
  }

  const authRequired = !GUEST_ALLOWED_TYPES.has(type)
  const accounts = accountsStore.accounts.filter(
    (a) => !(authRequired && isGuestAccount(a)),
  )

  // Account-optional types: always show selection so user can choose "no account"
  const forceShowSelection = ACCOUNT_OPTIONAL_TYPES.has(type)

  // Single account: auto-select (unless account-optional)
  const account = accounts[0]
  if (!forceShowSelection && accounts.length === 1 && account) {
    if (!account.hasToken && authRequired) {
      showLoginPrompt()
      return []
    }
    return buildDetailStep(type, account.id)
  }

  // Multiple accounts (or account-optional): show selection
  const items: QuickPickItem[] = []

  if (CROSS_ACCOUNT_TYPES.has(type)) {
    items.push({
      id: 'account-all',
      label: '全アカウント',
      icon: 'users',
      children: () => buildDetailStep(type, null),
    })
  }

  if (ACCOUNT_OPTIONAL_TYPES.has(type)) {
    items.push({
      id: 'account-none',
      label: 'アカウントなし',
      icon: 'circle-off',
      children: () => buildDetailStep(type, null),
    })
  }

  for (const account of accounts) {
    items.push({
      id: `account-${account.id}`,
      label: getAccountLabel(account),
      icon: 'user',
      avatarUrl: proxyThumbUrl(getAccountAvatarUrl(account), 18),
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

async function buildDetailStep(
  type: ColumnType,
  accountId: string | null,
): Promise<QuickPickItem[]> {
  const config = SELECTABLE_CONFIGS.find((c) => c.type === type)

  if (config && accountId) {
    // Searchable config: build step with search input + initial items
    if (config.searchCommand) {
      buildSearchableStep(config, accountId)
      return []
    }
    const items = await invokeListCommand(config.apiCommand, accountId)
    const icon = COLUMN_ICONS[type] ?? 'dots'
    const label = COLUMN_LABELS[type] ?? type
    const result: QuickPickItem[] = []

    // Add "create new" option if supported
    if (config.createEndpoint) {
      result.push({
        id: `create-new-${type}`,
        label: `新しい${label}を作成`,
        icon: 'plus',
        action: () => createNewItem(config, accountId),
      })
    }

    for (const item of items) {
      result.push({
        id: `select-${item.id}`,
        label: item.name,
        icon,
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
      })
    }
    return result
  }

  // User type: server-side search via onQueryChange
  if (type === 'user' && accountId) {
    buildUserSearchStep(accountId)
    return []
  }

  finalizeAddColumn(type, accountId)
  return []
}

/** Build a searchable Quick Pick step with initial items + server-side search */
function buildSearchableStep(config: SelectableConfig, accountId: string) {
  const commandStore = useCommandStore()
  const icon = COLUMN_ICONS[config.type] ?? 'dots'
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  function itemToQuickPick(item: { id: string; name: string }): QuickPickItem {
    return {
      id: `select-${item.id}`,
      label: item.name,
      icon,
      action: () => {
        useDeckStore().addColumn({
          type: config.type,
          name: item.name,
          width: 360,
          accountId,
          [config.idKey]: item.id,
          active: true,
        } as Omit<DeckColumn, 'id'>)
        useCommandStore().close()
      },
    }
  }

  const step = reactive({
    title: `${COLUMN_LABELS[config.type] ?? config.type}を選択`,
    placeholder: `${COLUMN_LABELS[config.type] ?? config.type}を検索...`,
    items: [] as QuickPickItem[],
    loading: true,
    onQueryChange(q: string) {
      if (debounceTimer) clearTimeout(debounceTimer)
      if (!q.trim()) {
        // Restore initial items
        fetchItems(config.apiCommand)
        return
      }
      const cmd = config.searchCommand
      if (!cmd) return
      debounceTimer = setTimeout(() => fetchItems(cmd, q), 300)
    },
  })

  async function fetchItems(command: string, query?: string) {
    step.loading = true
    try {
      const items = await invokeListCommand(command, accountId, query)
      step.items = items.map(itemToQuickPick)
    } catch {
      step.items = []
    } finally {
      step.loading = false
    }
  }

  commandStore.pushQuickPick(step)
  // Fetch initial items
  fetchItems(config.apiCommand)
}

function buildUserSearchStep(accountId: string) {
  const commandStore = useCommandStore()
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const step = reactive({
    title: 'ユーザーを選択',
    placeholder: 'ユーザーを検索...',
    items: [] as QuickPickItem[],
    loading: false,
    onQueryChange(q: string) {
      if (debounceTimer) clearTimeout(debounceTimer)
      if (!q.trim()) {
        step.items = []
        return
      }
      debounceTimer = setTimeout(async () => {
        step.loading = true
        try {
          const users = await searchUsers(accountId, q)
          step.items = users.map((u) => {
            const handle = formatUserHandle(u)
            return {
              id: `user-${u.id}`,
              label: u.name || handle,
              description: u.name ? handle : undefined,
              icon: 'user',
              avatarUrl: u.avatarUrl
                ? proxyThumbUrl(u.avatarUrl, 28)
                : undefined,
              action: () => {
                useDeckStore().addColumn({
                  type: 'user',
                  name: handle,
                  width: 360,
                  accountId,
                  userId: u.id,
                  active: true,
                } as Omit<DeckColumn, 'id'>)
                useCommandStore().close()
              },
            }
          })
        } catch {
          step.items = []
        } finally {
          step.loading = false
        }
      }, 300)
    },
  })

  commandStore.pushQuickPick(step)
}

async function createNewItem(config: SelectableConfig, accountId: string) {
  if (!config.createEndpoint) return
  const commandStore = useCommandStore()
  commandStore.close()
  const label = COLUMN_LABELS[config.type] ?? config.type
  const { prompt } = usePrompt()
  const name = await prompt({
    title: `新しい${label}を作成`,
    placeholder: `${label}名を入力...`,
  })
  if (!name) return
  try {
    const created = unwrap(
      await commands.apiRequest(accountId, config.createEndpoint, {
        name,
        ...config.createDefaults,
      }),
    ) as { id: string; name: string }
    useDeckStore().addColumn({
      type: config.type,
      name: created.name,
      width: 360,
      accountId,
      [config.idKey]: created.id,
      active: true,
    } as Omit<DeckColumn, 'id'>)
  } catch (e) {
    console.error(`[command] failed to create ${config.type}:`, e)
  }
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
