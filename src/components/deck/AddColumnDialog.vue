<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import AvatarStack from '@/components/common/AvatarStack.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { COLUMN_LABELS } from '@/composables/useColumnTabs'
import { useNativeDialog } from '@/composables/useNativeDialog'
import { useNavigation } from '@/composables/useNavigation'
import { formatUserHandle, useUserSearch } from '@/composables/useUserSearch'
import {
  getAccountAvatarUrl,
  getAccountLabel,
  isGuestAccount,
  useAccountsStore,
} from '@/stores/accounts'
import type { ColumnType, DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useIsCompactLayout } from '@/stores/ui'
import { logWarn } from '@/utils/logger'
import { showLoginPrompt } from '@/utils/loginPrompt'
import { commands, unwrap } from '@/utils/tauriInvoke'

const props = defineProps<{
  mode?: 'deck' | 'pip'
}>()

const emit = defineEmits<{
  close: []
  columnSelected: [column: Omit<DeckColumn, 'id'>]
}>()

const { navigateToLogin } = useNavigation()
const deckStore = useDeckStore()
const accountsStore = useAccountsStore()
const isCompact = useIsCompactLayout()

function finalizeColumn(config: Omit<DeckColumn, 'id'>) {
  if (props.mode === 'pip') {
    emit('columnSelected', config)
  } else {
    deckStore.addColumn(config)
    close()
  }
}

const expandedCategories = reactive<Record<string, boolean>>({
  account: true,
})

function toggleCategory(key: string) {
  expandedCategories[key] = !expandedCategories[key]
}

const addColumnType = ref<ColumnType | null>(null)

/** Column types that work without authentication (all APIs use get_credentials_or_anon) */
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

/** Column types that support cross-account mode (accountId: null) */
const CROSS_ACCOUNT_TYPES = new Set<ColumnType>([
  'notifications',
  'search',
  'chat',
  'mentions',
  'specified',
  'followRequests',
  'lookup',
])

/** Column types that can optionally work without an account */
const ACCOUNT_OPTIONAL_TYPES = new Set<ColumnType>(['widget', 'aiscript'])

/** Whether the selected column type requires authentication */
const requiresAuth = computed(() => {
  if (!addColumnType.value) return false
  return !GUEST_ALLOWED_TYPES.has(addColumnType.value)
})

function selectColumnType(type: ColumnType) {
  addColumnType.value = type
  // Account-independent types: skip account selection
  if (
    type === 'apiDocs' ||
    type === 'ai' ||
    type === 'streamInspector' ||
    type === 'workspaceExplorer'
  ) {
    addColumnForAccount(null)
    return
  }
  // Account-optional types: always show selection screen so user can choose "no account"
  if (ACCOUNT_OPTIONAL_TYPES.has(type)) return
  // Auto-select if only one valid account
  const authRequired = !GUEST_ALLOWED_TYPES.has(type)
  const accounts = accountsStore.accounts.filter(
    (a) => !(authRequired && isGuestAccount(a)),
  )
  const account = accounts[0]
  if (accounts.length === 1 && account) {
    if (!account.hasToken && authRequired) {
      showLoginPrompt()
    } else {
      addColumnForAccount(account.id)
    }
  }
}

/** Column types with extra properties beyond the standard defaults */
const COLUMN_EXTRA_PROPS: Partial<
  Record<ColumnType, Partial<Omit<DeckColumn, 'id'>>>
> = {
  widget: { widgets: [] },
  aiscript: { aiscriptCode: '<: "Hello, AiScript!"' },
  apiDocs: { accountId: null, width: 990 },
  ai: { accountId: null },
  streamInspector: { accountId: null },
  workspaceExplorer: { accountId: null },
  timeline: { tl: 'home', name: null },
}

function addColumnForAccount(accountId: string | null) {
  const type = addColumnType.value || 'timeline'
  const config = SELECTABLE_CONFIGS.find((c) => c.type === type)
  if (config && accountId) {
    fetchSelectItems(config, accountId)
    return
  }
  const extra = COLUMN_EXTRA_PROPS[type]
  finalizeColumn({
    type,
    name: COLUMN_LABELS[type] ?? type,
    width: 360,
    accountId,
    active: true,
    ...extra,
  } as Omit<DeckColumn, 'id'>)
}

// Selectable column types (list, antenna, channel, clip, user)
interface SelectableItem {
  id: string
  name: string
  avatarUrl?: string
}

interface SelectableConfig {
  type: ColumnType
  label: string
  icon: string
  apiFn: (accountId: string) => Promise<SelectableItem[]>
  idKey: string
  /** When set, shows a search input. Items are fetched via this function with (accountId, query). */
  searchFn?: (accountId: string, query: string) => Promise<SelectableItem[]>
  /** Column name derived from selected item (default: item.name) */
  formatName?: (item: SelectableItem) => string
  /** Misskey API endpoint for creating new items (e.g. 'clips/create') */
  createEndpoint?: string
  /** Default params to merge when creating (e.g. antenna defaults) */
  createDefaults?: Record<string, unknown>
}

// biome-ignore lint/suspicious/noExplicitAny: bindings の Result 型と SelectableItem の橋渡し
function unwrapSelectItems(result: any): SelectableItem[] {
  return unwrap(result) as unknown as SelectableItem[]
}

const SELECTABLE_CONFIGS: SelectableConfig[] = [
  {
    type: 'list',
    label: 'リスト',
    icon: 'ti-list',
    apiFn: (accountId) =>
      commands.apiGetUserLists(accountId).then(unwrapSelectItems),
    idKey: 'listId',
    createEndpoint: 'users/lists/create',
  },
  {
    type: 'antenna',
    label: 'アンテナ',
    icon: 'ti-antenna-bars-5',
    apiFn: (accountId) =>
      commands.apiGetAntennas(accountId).then(unwrapSelectItems),
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
    label: 'チャンネル',
    icon: 'ti-device-tv',
    apiFn: (accountId) =>
      commands.apiGetChannels(accountId).then(unwrapSelectItems),
    idKey: 'channelId',
    searchFn: (accountId, query) =>
      commands.apiSearchChannels(accountId, query).then(unwrapSelectItems),
  },
  {
    type: 'clip',
    label: 'クリップ',
    icon: 'ti-paperclip',
    apiFn: (accountId) =>
      commands.apiGetClips(accountId).then(unwrapSelectItems),
    idKey: 'clipId',
    createEndpoint: 'clips/create',
  },
  {
    type: 'user',
    label: 'ユーザー',
    icon: 'ti-user',
    apiFn: (accountId) =>
      commands
        .apiSearchUsersByQuery(accountId, '', null)
        .then(unwrapSelectItems),
    idKey: 'userId',
    searchFn: (accountId, query) =>
      commands
        .apiSearchUsersByQuery(accountId, query, null)
        .then(unwrapSelectItems),
    formatName: (item) => item.name,
  },
]

const selectAccountId = ref<string | null>(null)
const selectItems = ref<SelectableItem[]>([])
const selectLoading = ref(false)
const selectConfig = ref<SelectableConfig | null>(null)

// Unified search input for searchable configs (user, channel, etc.)
const searchQuery = ref('')
let searchDebounce: ReturnType<typeof setTimeout> | undefined

// User search via shared composable
const {
  query: userSearchQuery,
  results: userSearchResults,
  searching: userSearching,
} = useUserSearch(() => selectAccountId.value)

watch(userSearchResults, (users) => {
  if (selectConfig.value?.type !== 'user') return
  selectItems.value = users.map((u) => ({
    id: u.id,
    name: formatUserHandle(u),
    avatarUrl: u.avatarUrl ?? undefined,
  }))
})

watch(userSearching, (v) => {
  if (selectConfig.value?.type === 'user') selectLoading.value = v
})

// Dispatch search by config type
watch(searchQuery, (val) => {
  if (searchDebounce) clearTimeout(searchDebounce)
  const config = selectConfig.value
  if (!config?.searchFn) return

  // User: delegate to useUserSearch composable
  if (config.type === 'user') {
    userSearchQuery.value = val
    return
  }

  // Generic: server-side search with fallback to initial list
  const q = val.trim()
  const accountId = selectAccountId.value
  if (!q || !accountId) {
    if (accountId) fetchInitialItems(config, accountId)
    return
  }
  searchDebounce = setTimeout(() => searchSelectItems(config, q), 300)
})

async function searchSelectItems(config: SelectableConfig, query: string) {
  if (!config.searchFn || !selectAccountId.value) return
  selectLoading.value = true
  try {
    selectItems.value = await config.searchFn(selectAccountId.value, query)
  } catch (e) {
    logWarn(`deck-search-${config.type}`, e)
    selectItems.value = []
  } finally {
    selectLoading.value = false
  }
}

async function fetchInitialItems(config: SelectableConfig, accountId: string) {
  selectLoading.value = true
  try {
    selectItems.value = await config.apiFn(accountId)
  } catch (e) {
    logWarn(`deck-fetch-${config.type}`, e)
    selectItems.value = []
  } finally {
    selectLoading.value = false
  }
}

async function fetchSelectItems(config: SelectableConfig, accountId: string) {
  selectConfig.value = config
  selectAccountId.value = accountId
  searchQuery.value = ''
  userSearchQuery.value = ''
  if (config.type === 'user') {
    // User: search-only, no initial list
    selectItems.value = []
    selectLoading.value = false
    return
  }
  selectLoading.value = true
  try {
    selectItems.value = await config.apiFn(accountId)
  } catch (e) {
    logWarn(`deck-fetch-${config.type}`, e)
    selectItems.value = []
  } finally {
    selectLoading.value = false
  }
}

// --- Inline create for list/antenna/clip ---
const showCreateForm = ref(false)
const createName = ref('')
const createLoading = ref(false)

async function createNewItem() {
  const config = selectConfig.value
  const accountId = selectAccountId.value
  if (!config?.createEndpoint || !accountId) return
  const name = createName.value.trim()
  if (!name) return
  createLoading.value = true
  try {
    const created = unwrap(
      await commands.apiRequest(accountId, config.createEndpoint, {
        name,
        ...config.createDefaults,
      }),
    ) as unknown as SelectableItem
    // Add column with the newly created item
    const colName = config.formatName
      ? config.formatName(created)
      : created.name
    finalizeColumn({
      type: config.type,
      name: colName,
      width: 360,
      accountId,
      [config.idKey]: created.id,
      active: true,
    } as Omit<DeckColumn, 'id'>)
  } catch (e) {
    logWarn(`deck-create-${config.type}`, e)
  } finally {
    createLoading.value = false
    showCreateForm.value = false
    createName.value = ''
  }
}

function addSelectableColumn(item: SelectableItem) {
  if (!selectAccountId.value || !selectConfig.value) return
  const name = selectConfig.value.formatName
    ? selectConfig.value.formatName(item)
    : item.name
  finalizeColumn({
    type: selectConfig.value.type,
    name,
    width: 360,
    accountId: selectAccountId.value,
    [selectConfig.value.idKey]: item.id,
    active: true,
  } as Omit<DeckColumn, 'id'>)
}

const dialogRef = ref<HTMLDialogElement | null>(null)
const showDialog = ref(true)

if (props.mode !== 'pip') {
  useNativeDialog(dialogRef, showDialog, {
    onCancel: () => close(),
  })
}

function close() {
  emit('close')
}
</script>

<template>
  <component
    :is="mode !== 'pip' ? 'dialog' : 'div'"
    ref="dialogRef"
    :class="[mode === 'pip' ? $style.addInline : [$style.addOverlay, '_nativeDialog']]"
  >
    <div :class="[mode === 'pip' ? $style.addPopupInline : $style.addPopup, isCompact && $style.mobile]">
      <div v-if="!(mode === 'pip' && !addColumnType && !selectConfig)" :class="[$style.addPopupHeader, mode === 'pip' && $style.addPopupHeaderPip]">
        <button v-if="addColumnType && !selectConfig" class="_button" :class="$style.addBackBtn" @click="addColumnType = null">
          <i class="ti ti-chevron-left" />
        </button>
        <button v-else-if="selectConfig" class="_button" :class="$style.addBackBtn" @click="selectConfig = null; selectItems = []; selectAccountId = null; searchQuery = ''">
          <i class="ti ti-chevron-left" />
        </button>
        <span :class="$style.addPopupTitle">
          {{ selectConfig ? `${selectConfig.label}を選択` : addColumnType ? 'アカウントを選択' : 'カラムを追加' }}
        </span>
      </div>

      <!-- Step 1: Column type selection -->
      <template v-if="!addColumnType">
        <div :class="$style.addCategorySection">
          <button class="_button" :class="$style.addCategoryLabel" @click="toggleCategory('account')">
            <i class="ti ti-user" />
            アカウント
            <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedCategories.account }]" />
          </button>
          <template v-if="expandedCategories.account">
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('timeline')">
              <i class="ti ti-home" />
              <span>タイムライン</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('notifications')">
              <i class="ti ti-bell" />
              <span>通知</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('drive')">
              <i class="ti ti-cloud" />
              <span>ドライブ</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('followRequests')">
              <i class="ti ti-user-plus" />
              <span>フォローリクエスト</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('list')">
              <i class="ti ti-list" />
              <span>リスト</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('antenna')">
              <i class="ti ti-antenna-bars-5" />
              <span>アンテナ</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('favorites')">
              <i class="ti ti-star" />
              <span>お気に入り</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('clip')">
              <i class="ti ti-paperclip" />
              <span>クリップ</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('mentions')">
              <i class="ti ti-at" />
              <span>メンション</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('specified')">
              <i class="ti ti-mail" />
              <span>ダイレクト</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('chat')">
              <i class="ti ti-messages" />
              <span>チャット</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('achievements')">
              <i class="ti ti-medal" />
              <span>実績</span>
            </button>
          </template>
        </div>

        <div :class="$style.addCategorySection">
          <button class="_button" :class="$style.addCategoryLabel" @click="toggleCategory('server')">
            <i class="ti ti-server" />
            サーバー
            <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedCategories.server }]" />
          </button>
          <template v-if="expandedCategories.server">
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('serverInfo')">
              <i class="ti ti-server" />
              <span>サーバー情報</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('aboutMisskey')">
              <i class="ti ti-info-circle" />
              <span>Misskeyについて</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('emoji')">
              <i class="ti ti-mood-smile" />
              <span>カスタム絵文字</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('ads')">
              <i class="ti ti-ad-2" />
              <span>広告</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('explore')">
              <i class="ti ti-compass" />
              <span>みつける</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('announcements')">
              <i class="ti ti-speakerphone" />
              <span>お知らせ</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('search')">
              <i class="ti ti-search" />
              <span>検索</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('lookup')">
              <i class="ti ti-world-search" />
              <span>URI照会</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('channel')">
              <i class="ti ti-device-tv" />
              <span>チャンネル</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('gallery')">
              <i class="ti ti-icons" />
              <span>ギャラリー</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('play')">
              <i class="ti ti-player-play" />
              <span>Misskey Play</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('page')">
              <i class="ti ti-note" />
              <span>ページ</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('user')">
              <i class="ti ti-user" />
              <span>ユーザー</span>
            </button>
          </template>
        </div>

        <div :class="$style.addCategorySection">
          <button class="_button" :class="$style.addCategoryLabel" @click="toggleCategory('tools')">
            <i class="ti ti-tool" />
            ツール
            <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedCategories.tools }]" />
          </button>
          <template v-if="expandedCategories.tools">
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('workspaceExplorer')">
              <i class="ti ti-files" />
              <span>エクスプローラー</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('widget')">
              <i class="ti ti-app-window" />
              <span>ウィジェット</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('aiscript')">
              <i class="ti ti-terminal-2" />
              <span>スクラッチパッド</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('apiConsole')">
              <i class="ti ti-api" />
              <span>APIコンソール</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('apiDocs')">
              <i class="ti ti-book" />
              <span>APIドキュメント</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('ai')">
              <i class="ti ti-sparkles" />
              <span>AIチャット</span>
            </button>
            <button class="_button" :class="$style.addTypeBtn" @click="selectColumnType('streamInspector')">
              <i class="ti ti-activity-heartbeat" />
              <span>ストリーム</span>
            </button>
          </template>
        </div>
      </template>

      <!-- Step 3a: Item selection (list/antenna/channel/clip/user) -->
      <template v-else-if="selectConfig">
        <div v-if="selectConfig.searchFn" :class="$style.selectSearchBar">
          <i class="ti ti-search" :class="$style.selectSearchIcon" />
          <input
            v-model="searchQuery"
            :class="$style.selectSearchInput"
            type="text"
            :placeholder="`${selectConfig.label}を検索...`"
          />
          <i v-if="selectLoading" class="ti ti-loader-2 nd-spin" :class="$style.selectSearchIcon" />
        </div>

        <!-- Inline create form -->
        <div v-if="selectConfig.createEndpoint && showCreateForm" :class="$style.createForm">
          <form @submit.prevent="createNewItem">
            <input
              v-model="createName"
              :class="$style.createInput"
              type="text"
              :placeholder="`${selectConfig.label}名を入力...`"
              :disabled="createLoading"
            />
            <div :class="$style.createActions">
              <button type="button" class="_button" :class="$style.createCancelBtn" @click="showCreateForm = false; createName = ''">
                キャンセル
              </button>
              <button type="submit" class="_button" :class="$style.createSubmitBtn" :disabled="!createName.trim() || createLoading">
                <i v-if="createLoading" class="ti ti-loader-2 nd-spin" />
                <template v-else>作成</template>
              </button>
            </div>
          </form>
        </div>
        <!-- Create button -->
        <button
          v-else-if="selectConfig.createEndpoint"
          class="_button"
          :class="[$style.addTypeBtn, $style.createBtn]"
          @click="showCreateForm = true"
        >
          <i class="ti ti-plus" />
          <span>新しい{{ selectConfig.label }}を作成</span>
        </button>

        <div v-if="!selectConfig.searchFn && selectLoading" :class="$style.addPopupLoading"><LoadingSpinner /></div>
        <div v-else-if="!selectLoading && selectItems.length === 0 && (!selectConfig.searchFn || searchQuery.trim())" :class="$style.addPopupEmpty">{{ selectConfig.label }}が見つかりません</div>
        <button
          v-for="item in selectItems"
          :key="item.id"
          class="_button"
          :class="$style.addTypeBtn"
          @click="addSelectableColumn(item)"
        >
          <img v-if="item.avatarUrl" :src="item.avatarUrl" :class="$style.selectItemAvatar" />
          <i v-else :class="'ti ' + selectConfig.icon" />
          <span>{{ item.name }}</span>
        </button>
      </template>

      <!-- Step 2: Account selection -->
      <template v-else>
        <div v-if="accountsStore.accounts.length === 0" :class="$style.addPopupEmpty">
          アカウントが登録されていません。
          <button class="_button" style="color: var(--nd-accent); text-decoration: underline;" @click="close(); navigateToLogin()">
            アカウントを追加
          </button>
        </div>

        <button
          v-if="addColumnType && CROSS_ACCOUNT_TYPES.has(addColumnType) && accountsStore.accounts.length > 1"
          class="_button"
          :class="$style.addAccountBtn"
          @click="addColumnForAccount(null)"
        >
          <AvatarStack :size="28" />
          <span>全アカウント</span>
        </button>
        <button
          v-if="addColumnType && ACCOUNT_OPTIONAL_TYPES.has(addColumnType)"
          class="_button"
          :class="$style.addAccountBtn"
          @click="addColumnForAccount(null)"
        >
          <i class="ti ti-circle-off" style="font-size: 28px; opacity: 0.5;" />
          <span>アカウントなし</span>
        </button>
        <button
          v-for="account in accountsStore.accounts"
          :key="account.id"
          class="_button"
          :class="[$style.addAccountBtn, { [$style.addAccountDisabled]: isGuestAccount(account) && requiresAuth }]"
          :disabled="isGuestAccount(account) && requiresAuth"
          @click="(!account.hasToken && requiresAuth) ? showLoginPrompt() : addColumnForAccount(account.id)"
        >
          <img :src="getAccountAvatarUrl(account)" :class="$style.addAccountAvatar" />
          <span>{{ getAccountLabel(account) }}</span>
        </button>
      </template>
    </div>
  </component>
</template>

<style lang="scss" module>
.addOverlay {
  &::backdrop {
    background: var(--nd-modalBg);
  }

  @media (prefers-reduced-motion: no-preference) {
    > .addPopup {
      animation: addPopupIn 0.2s var(--nd-ease-spring);
    }
  }
}

.addPopup {
  background: var(--nd-popup);
  border-radius: 16px;
  box-shadow: 0 8px 32px var(--nd-shadow);
  min-width: 320px;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
}

.addInline {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.addPopupInline {
  background: var(--nd-bg);
  width: 100%;
  flex: 1;
  overflow-y: auto;
}

.addPopupHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 24px 16px;
  font-size: 1em;
  font-weight: bold;
  border-bottom: 1px solid var(--nd-divider);
}

.addPopupHeaderPip {
  padding: 12px 16px;
  font-size: 0.9em;
}

.addPopupTitle {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.addPopupEmpty {
  padding: 2rem;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.6;
  font-size: 0.9em;

  a {
    color: var(--nd-accent);
  }
}

.addPopupLoading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.addAccountBtn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 24px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  & + & {
    border-top: 1px solid var(--nd-divider);
  }
}

.addAccountDisabled {
  opacity: 0.4;
  pointer-events: none;
}

.addAccountAvatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.addBackBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--nd-radius-sm);
  opacity: 0.7;
  transition: background var(--nd-duration-base), opacity var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}

.addTypeBtn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0 24px;
  line-height: 2.85rem;
  font-size: 0.95em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  & + & {
    border-top: 1px solid var(--nd-divider);
  }

  :global(.ti) {
    flex-shrink: 0;
    width: 32px;
    font-size: 1.5rem;
    text-align: center;
    opacity: 0.7;
  }
}

.addCategorySection {
  & + & {
    border-top: 1px solid var(--nd-divider);
  }
}

.addCategoryLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  position: sticky;
  top: 0;
  z-index: 1;
  width: 100%;
  padding: 10px 24px;
  background: var(--nd-popup);
  font-size: 0.8em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.7;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 1;
  }

  .addPopupInline & {
    background: var(--nd-bg);
  }
}

.chevron {
  margin-left: auto;
  font-size: 0.9em;
  transition: transform var(--nd-duration-base);
  transform: rotate(-90deg);
}

.chevronOpen {
  transform: rotate(0deg);
}

.selectSearchBar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--nd-divider);
}

.selectSearchIcon {
  flex-shrink: 0;
  opacity: 0.4;
}

.selectSearchInput {
  flex: 1;
  min-width: 0;
  background: var(--nd-buttonBg);
  border: none;
  border-radius: var(--nd-radius-sm);
  padding: 8px 12px;
  font-size: 0.9em;
  color: var(--nd-fg);
  outline: none;

  &:focus {
    box-shadow: 0 0 0 2px var(--nd-accent);
  }

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.4;
  }
}

.selectItemAvatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  object-fit: cover;
}

.createBtn {
  color: var(--nd-accent);
  opacity: 0.85;

  &:hover {
    opacity: 1;
  }
}

.createForm {
  padding: 8px 12px;
}

.createInput {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.9em;
  outline: none;

  &:focus {
    border-color: var(--nd-accent);
  }
}

.createActions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 8px;
}

.createCancelBtn {
  padding: 4px 12px;
  border-radius: var(--nd-radius-sm);
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.createSubmitBtn {
  padding: 4px 12px;
  border-radius: var(--nd-radius-sm);
  font-size: 0.85em;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);

  &:hover {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

@keyframes addPopupIn {
  from { opacity: 0; transform: scale(0.95); }
}

.addPopup.mobile {
  min-width: auto;
  width: calc(100% - 32px);
  max-width: 480px;
}
</style>
