<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AvatarStack from '@/components/common/AvatarStack.vue'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { useNavigation } from '@/composables/useNavigation'
import {
  getAccountAvatarUrl,
  getAccountLabel,
  isGuestAccount,
  useAccountsStore,
} from '@/stores/accounts'
import type { ColumnType, DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useIsCompactLayout } from '@/stores/ui'
import { showLoginPrompt } from '@/utils/loginPrompt'
import { invoke } from '@/utils/tauriInvoke'

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

const addColumnType = ref<ColumnType | null>(null)

/** Column types that work without authentication */
const GUEST_ALLOWED_TYPES = new Set<ColumnType>([
  'timeline',
  'user',
  'search',
  'channel',
  'explore',
  'emoji',
])

/** Column types that support cross-account mode (accountId: null) */
const CROSS_ACCOUNT_TYPES = new Set<ColumnType>([
  'notifications',
  'search',
  'chat',
])

/** Whether the selected column type requires authentication */
const requiresAuth = computed(() => {
  if (!addColumnType.value) return false
  return !GUEST_ALLOWED_TYPES.has(addColumnType.value)
})

function selectColumnType(type: ColumnType) {
  addColumnType.value = type
  // Account-independent types: skip account selection
  if (type === 'apiDocs') {
    addColumnForAccount(null)
    return
  }
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

function addColumnForAccount(accountId: string | null) {
  const type = addColumnType.value || 'timeline'
  const config = SELECTABLE_CONFIGS.find((c) => c.type === type)
  if (config) {
    fetchSelectItems(config, accountId)
    return
  }
  if (type === 'user') {
    addUserAccountId.value = accountId
    return
  }
  if (type === 'widget') {
    finalizeColumn({
      type: 'widget',
      name: 'ウィジェット',
      width: 360,
      accountId,
      active: true,
      widgets: [],
    })
    return
  }
  if (type === 'aiscript') {
    finalizeColumn({
      type: 'aiscript',
      name: 'スクラッチパッド',
      width: 360,
      accountId,
      active: true,
      aiscriptCode: '<: "Hello, AiScript!"',
    })
    return
  }
  if (type === 'apiConsole') {
    finalizeColumn({
      type: 'apiConsole',
      name: 'APIコンソール',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (type === 'lookup') {
    finalizeColumn({
      type: 'lookup',
      name: 'URI照会',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (type === 'serverInfo') {
    finalizeColumn({
      type: 'serverInfo',
      name: 'サーバー情報',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (type === 'ads') {
    finalizeColumn({
      type: 'ads',
      name: '広告',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (type === 'aboutMisskey') {
    finalizeColumn({
      type: 'aboutMisskey',
      name: 'Misskeyについて',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (type === 'emoji') {
    finalizeColumn({
      type: 'emoji',
      name: 'カスタム絵文字',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (type === 'apiDocs') {
    finalizeColumn({
      type: 'apiDocs',
      name: 'APIドキュメント',
      width: 990,
      accountId: null,
      active: true,
    })
    return
  }
  if (type === 'play') {
    finalizeColumn({
      type: 'play',
      name: 'Misskey Play',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (type === 'page') {
    finalizeColumn({
      type: 'page',
      name: 'ページ',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (type === 'ai') {
    finalizeColumn({
      type: 'ai',
      name: 'AIチャット',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (type === 'drive') {
    finalizeColumn({
      type: 'drive',
      name: 'ドライブ',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (type === 'gallery') {
    finalizeColumn({
      type: 'gallery',
      name: 'ギャラリー',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (type === 'explore') {
    finalizeColumn({
      type: 'explore',
      name: 'みつける',
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  if (
    type === 'favorites' ||
    type === 'mentions' ||
    type === 'specified' ||
    type === 'chat' ||
    type === 'announcements' ||
    type === 'followRequests' ||
    type === 'achievements'
  ) {
    const nameMap: Record<string, string> = {
      favorites: 'お気に入り',
      mentions: 'メンション',
      specified: 'ダイレクト',
      chat: 'チャット',
      announcements: 'お知らせ',
      followRequests: 'フォローリクエスト',
      achievements: '実績',
    }
    finalizeColumn({
      type,
      name: nameMap[type] ?? type,
      width: 360,
      accountId,
      active: true,
    })
    return
  }
  finalizeColumn({
    type,
    name: null,
    width: 360,
    accountId,
    tl: type === 'timeline' ? 'home' : undefined,
    active: true,
  })
}

// Selectable column types (list, antenna, channel, clip)
interface SelectableItem {
  id: string
  name: string
}

interface SelectableConfig {
  type: ColumnType
  label: string
  icon: string
  apiCommand: string
  idKey: string
}

const SELECTABLE_CONFIGS: SelectableConfig[] = [
  {
    type: 'list',
    label: 'リスト',
    icon: 'ti-list',
    apiCommand: 'api_get_user_lists',
    idKey: 'listId',
  },
  {
    type: 'antenna',
    label: 'アンテナ',
    icon: 'ti-antenna-bars-5',
    apiCommand: 'api_get_antennas',
    idKey: 'antennaId',
  },
  {
    type: 'channel',
    label: 'チャンネル',
    icon: 'ti-device-tv',
    apiCommand: 'api_get_channels',
    idKey: 'channelId',
  },
  {
    type: 'clip',
    label: 'クリップ',
    icon: 'ti-paperclip',
    apiCommand: 'api_get_clips',
    idKey: 'clipId',
  },
]

const selectAccountId = ref<string | null>(null)
const selectItems = ref<SelectableItem[]>([])
const selectLoading = ref(false)
const selectConfig = ref<SelectableConfig | null>(null)

async function fetchSelectItems(config: SelectableConfig, accountId: string) {
  selectConfig.value = config
  selectAccountId.value = accountId
  selectLoading.value = true
  try {
    selectItems.value = await invoke<SelectableItem[]>(config.apiCommand, {
      accountId,
    })
  } catch (e) {
    console.error(`[deck] failed to fetch ${config.type}s:`, e)
    selectItems.value = []
  } finally {
    selectLoading.value = false
  }
}

function addSelectableColumn(itemId: string, itemName: string) {
  if (!selectAccountId.value || !selectConfig.value) return
  finalizeColumn({
    type: selectConfig.value.type,
    name: itemName,
    width: 360,
    accountId: selectAccountId.value,
    [selectConfig.value.idKey]: itemId,
    active: true,
  } as Omit<DeckColumn, 'id'>)
}

// User column creation
const addUserAccountId = ref<string | null>(null)
const userSearchInput = ref('')
const userSearchError = ref<string | null>(null)
const searchingUser = ref(false)

async function searchAndAddUserColumn() {
  if (!addUserAccountId.value || !userSearchInput.value.trim()) return
  const raw = userSearchInput.value.trim().replace(/^@/, '')
  const parts = raw.split('@')
  const username = parts[0] || ''
  const host = parts[1] || null
  if (!username) return

  searchingUser.value = true
  userSearchError.value = null
  try {
    const user = await invoke<{
      id: string
      username: string
      host: string | null
    }>('api_lookup_user', {
      accountId: addUserAccountId.value,
      username,
      host,
    })
    const displayName = user.host
      ? `@${user.username}@${user.host}`
      : `@${user.username}`
    finalizeColumn({
      type: 'user',
      name: displayName,
      width: 360,
      accountId: addUserAccountId.value,
      userId: user.id,
      active: true,
    })
  } catch {
    userSearchError.value = 'ユーザーが見つかりません'
  } finally {
    searchingUser.value = false
  }
}

const dialogRef = ref<HTMLElement | null>(null)
const { activate: activateTrap } = useFocusTrap(dialogRef, {
  onEscape: () => close(),
})

onMounted(activateTrap)

function close() {
  emit('close')
}
</script>

<template>
  <div ref="dialogRef" :class="[mode === 'pip' ? $style.addInline : $style.addOverlay]" @click="mode !== 'pip' && close()">
    <div :class="[mode === 'pip' ? $style.addPopupInline : $style.addPopup, isCompact && $style.mobile]" @click.stop>
      <div v-if="!(mode === 'pip' && !addColumnType && !selectConfig && !addUserAccountId)" :class="[$style.addPopupHeader, mode === 'pip' && $style.addPopupHeaderPip]">
        <button v-if="addColumnType && !selectConfig && !addUserAccountId" class="_button" :class="$style.addBackBtn" @click="addColumnType = null">
          <i class="ti ti-chevron-left" />
        </button>
        <button v-else-if="selectConfig" class="_button" :class="$style.addBackBtn" @click="selectConfig = null; selectItems = []; selectAccountId = null">
          <i class="ti ti-chevron-left" />
        </button>
        <button v-else-if="addUserAccountId" class="_button" :class="$style.addBackBtn" @click="addUserAccountId = null; userSearchInput = ''; userSearchError = null">
          <i class="ti ti-chevron-left" />
        </button>
        <span :class="$style.addPopupTitle">
          {{ selectConfig ? `${selectConfig.label}を選択` : addUserAccountId ? 'ユーザーを検索' : addColumnType ? 'アカウントを選択' : 'カラムを追加' }}
        </span>
      </div>

      <!-- Step 1: Column type selection -->
      <template v-if="!addColumnType">
        <div :class="$style.addCategorySection">
          <div :class="$style.addCategoryLabel">アカウント</div>
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
        </div>

        <div :class="$style.addCategorySection">
          <div :class="$style.addCategoryLabel">サーバー</div>
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
        </div>

        <div :class="$style.addCategorySection">
          <div :class="$style.addCategoryLabel">ツール</div>
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
          <button v-if="!isCompact" class="_button" :class="$style.addTypeBtn" @click="selectColumnType('ai')">
            <i class="ti ti-sparkles" />
            <span>AIチャット</span>
          </button>
        </div>
      </template>

      <!-- Step 3a: Item selection (list/antenna/channel/clip) -->
      <template v-else-if="selectConfig">
        <div v-if="selectLoading" :class="$style.addPopupEmpty">読み込み中...</div>
        <div v-else-if="selectItems.length === 0" :class="$style.addPopupEmpty">{{ selectConfig.label }}が見つかりません</div>
        <button
          v-for="item in selectItems"
          :key="item.id"
          class="_button"
          :class="$style.addTypeBtn"
          @click="addSelectableColumn(item.id, item.name)"
        >
          <i :class="'ti ' + selectConfig.icon" />
          <span>{{ item.name }}</span>
        </button>
      </template>

      <!-- Step 3d: User search (for user columns) -->
      <template v-else-if="addUserAccountId">
        <div :class="$style.addUserSearch">
          <input
            v-model="userSearchInput"
            :class="$style.addUserInput"
            type="text"
            placeholder="@ユーザー名 or @ユーザー名@ホスト"
            @keydown.enter="searchAndAddUserColumn"
          />
          <button
            class="_button"
            :class="$style.addUserSubmit"
            :disabled="searchingUser || !userSearchInput.trim()"
            @click="searchAndAddUserColumn"
          >
            {{ searchingUser ? '...' : '追加' }}
          </button>
        </div>
        <div v-if="userSearchError" :class="$style.addPopupEmpty" style="color: var(--nd-love);">
          {{ userSearchError }}
        </div>
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
  </div>
</template>

<style lang="scss" module>
.addOverlay {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-modalBg);
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

.addUserSearch {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
}

.addUserInput {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.85em;
  outline: none;

  &:focus {
    border-color: var(--nd-accent);
  }
}

.addUserSubmit {
  padding: 8px 16px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-accent);
  color: #fff;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
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
  gap: 12px;
  width: 100%;
  padding: 14px 24px;
  min-height: 44px;
  font-size: 0.9em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  & + & {
    border-top: 1px solid var(--nd-divider);
  }

  .ti {
    opacity: 0.7;
    font-size: 18px;
  }
}

.addCategorySection {
  & + & {
    border-top: 1px solid var(--nd-divider);
  }
}

.addCategoryLabel {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 12px 24px 4px;
  background: var(--nd-popup);
  font-size: 0.75em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.5;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  .addPopupInline & {
    background: var(--nd-bg);
  }
}

.addPopup.mobile {
  min-width: auto;
  width: calc(100% - 32px);
  max-width: 480px;
}
</style>
