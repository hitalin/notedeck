<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'

const emit = defineEmits<{
  close: []
}>()

const deckStore = useDeckStore()
const accountsStore = useAccountsStore()

const addColumnType = ref<
  | 'timeline'
  | 'notifications'
  | 'search'
  | 'list'
  | 'antenna'
  | 'favorites'
  | 'clip'
  | 'user'
  | 'mentions'
  | 'channel'
  | 'specified'
  | 'chat'
  | 'widget'
  | null
>(null)

function selectColumnType(
  type:
    | 'timeline'
    | 'notifications'
    | 'search'
    | 'list'
    | 'antenna'
    | 'favorites'
    | 'clip'
    | 'user'
    | 'mentions'
    | 'channel'
    | 'specified'
    | 'chat'
    | 'widget',
) {
  addColumnType.value = type
}

function addColumnForAccount(accountId: string) {
  const type = addColumnType.value || 'timeline'
  if (type === 'list') {
    fetchUserLists(accountId)
    return
  }
  if (type === 'antenna') {
    fetchAntennas(accountId)
    return
  }
  if (type === 'clip') {
    fetchClips(accountId)
    return
  }
  if (type === 'channel') {
    fetchChannels(accountId)
    return
  }
  if (type === 'user') {
    addUserAccountId.value = accountId
    return
  }
  if (type === 'widget') {
    deckStore.addColumn({
      type: 'widget',
      name: 'Widgets',
      width: 330,
      accountId,
      active: true,
      widgets: [],
    })
    close()
    return
  }
  if (
    type === 'favorites' ||
    type === 'mentions' ||
    type === 'specified' ||
    type === 'chat'
  ) {
    const nameMap: Record<string, string> = {
      favorites: 'Favorites',
      mentions: 'Mentions',
      specified: 'Direct',
      chat: 'Chat',
    }
    deckStore.addColumn({
      type,
      name: nameMap[type] ?? type,
      width: 330,
      accountId,
      active: true,
    })
    close()
    return
  }
  deckStore.addColumn({
    type,
    name: null,
    width: 330,
    accountId,
    tl: type === 'timeline' ? 'home' : undefined,
    active: true,
  })
  close()
}

// List column creation
interface UserListItem {
  id: string
  name: string
}
const addListAccountId = ref<string | null>(null)
const userLists = ref<UserListItem[]>([])
const loadingLists = ref(false)

async function fetchUserLists(accountId: string) {
  addListAccountId.value = accountId
  loadingLists.value = true
  try {
    userLists.value = await invoke<UserListItem[]>('api_get_user_lists', {
      accountId,
    })
  } catch (e) {
    console.error('[deck] failed to fetch user lists:', e)
    userLists.value = []
  } finally {
    loadingLists.value = false
  }
}

function addListColumn(listId: string, listName: string) {
  if (!addListAccountId.value) return
  deckStore.addColumn({
    type: 'list',
    name: listName,
    width: 330,
    accountId: addListAccountId.value,
    listId,
    active: true,
  })
  close()
}

// Antenna column creation
interface AntennaItem {
  id: string
  name: string
}
const addAntennaAccountId = ref<string | null>(null)
const antennas = ref<AntennaItem[]>([])
const loadingAntennas = ref(false)

async function fetchAntennas(accountId: string) {
  addAntennaAccountId.value = accountId
  loadingAntennas.value = true
  try {
    antennas.value = await invoke<AntennaItem[]>('api_get_antennas', {
      accountId,
    })
  } catch (e) {
    console.error('[deck] failed to fetch antennas:', e)
    antennas.value = []
  } finally {
    loadingAntennas.value = false
  }
}

function addAntennaColumn(antennaId: string, antennaName: string) {
  if (!addAntennaAccountId.value) return
  deckStore.addColumn({
    type: 'antenna',
    name: antennaName,
    width: 330,
    accountId: addAntennaAccountId.value,
    antennaId,
    active: true,
  })
  close()
}

// Channel column creation
interface ChannelItem {
  id: string
  name: string
}
const addChannelAccountId = ref<string | null>(null)
const channels = ref<ChannelItem[]>([])
const loadingChannels = ref(false)

async function fetchChannels(accountId: string) {
  addChannelAccountId.value = accountId
  loadingChannels.value = true
  try {
    channels.value = await invoke<ChannelItem[]>('api_get_channels', {
      accountId,
    })
  } catch (e) {
    console.error('[deck] failed to fetch channels:', e)
    channels.value = []
  } finally {
    loadingChannels.value = false
  }
}

function addChannelColumn(channelId: string, channelName: string) {
  if (!addChannelAccountId.value) return
  deckStore.addColumn({
    type: 'channel',
    name: channelName,
    width: 330,
    accountId: addChannelAccountId.value,
    channelId,
    active: true,
  })
  close()
}

// Clip column creation
interface ClipItem {
  id: string
  name: string
}
const addClipAccountId = ref<string | null>(null)
const clips = ref<ClipItem[]>([])
const loadingClips = ref(false)

async function fetchClips(accountId: string) {
  addClipAccountId.value = accountId
  loadingClips.value = true
  try {
    clips.value = await invoke<ClipItem[]>('api_get_clips', { accountId })
  } catch (e) {
    console.error('[deck] failed to fetch clips:', e)
    clips.value = []
  } finally {
    loadingClips.value = false
  }
}

function addClipColumn(clipId: string, clipName: string) {
  if (!addClipAccountId.value) return
  deckStore.addColumn({
    type: 'clip',
    name: clipName,
    width: 330,
    accountId: addClipAccountId.value,
    clipId,
    active: true,
  })
  close()
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
    deckStore.addColumn({
      type: 'user',
      name: displayName,
      width: 330,
      accountId: addUserAccountId.value,
      userId: user.id,
      active: true,
    })
    close()
  } catch {
    userSearchError.value = 'User not found'
  } finally {
    searchingUser.value = false
  }
}

function close() {
  emit('close')
}
</script>

<template>
  <div class="add-overlay" @click="close()">
    <div class="add-popup" @click.stop>
      <div class="add-popup-header">
        <button v-if="addColumnType && !addListAccountId && !addAntennaAccountId && !addChannelAccountId && !addClipAccountId && !addUserAccountId" class="_button add-back-btn" @click="addColumnType = null">
          <i class="ti ti-chevron-left" />
        </button>
        <button v-else-if="addListAccountId" class="_button add-back-btn" @click="addListAccountId = null; userLists = []">
          <i class="ti ti-chevron-left" />
        </button>
        <button v-else-if="addAntennaAccountId" class="_button add-back-btn" @click="addAntennaAccountId = null; antennas = []">
          <i class="ti ti-chevron-left" />
        </button>
        <button v-else-if="addChannelAccountId" class="_button add-back-btn" @click="addChannelAccountId = null; channels = []">
          <i class="ti ti-chevron-left" />
        </button>
        <button v-else-if="addClipAccountId" class="_button add-back-btn" @click="addClipAccountId = null; clips = []">
          <i class="ti ti-chevron-left" />
        </button>
        <button v-else-if="addUserAccountId" class="_button add-back-btn" @click="addUserAccountId = null; userSearchInput = ''; userSearchError = null">
          <i class="ti ti-chevron-left" />
        </button>
        {{ addListAccountId ? 'Select list' : addAntennaAccountId ? 'Select antenna' : addChannelAccountId ? 'Select channel' : addClipAccountId ? 'Select clip' : addUserAccountId ? 'Find user' : addColumnType ? 'Select account' : 'Add column' }}
      </div>

      <!-- Step 1: Column type selection -->
      <template v-if="!addColumnType">
        <button class="_button add-type-btn" @click="selectColumnType('timeline')">
          <i class="ti ti-home" />
          <span>Timeline</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('list')">
          <i class="ti ti-list" />
          <span>List</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('antenna')">
          <i class="ti ti-antenna-bars-5" />
          <span>Antenna</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('channel')">
          <i class="ti ti-device-tv" />
          <span>Channel</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('notifications')">
          <i class="ti ti-bell" />
          <span>Notifications</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('search')">
          <i class="ti ti-search" />
          <span>Search</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('favorites')">
          <i class="ti ti-star" />
          <span>Favorites</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('clip')">
          <i class="ti ti-paperclip" />
          <span>Clip</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('user')">
          <i class="ti ti-user" />
          <span>User</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('mentions')">
          <i class="ti ti-at" />
          <span>Mentions</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('specified')">
          <i class="ti ti-mail" />
          <span>Direct</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('chat')">
          <i class="ti ti-messages" />
          <span>Chat</span>
        </button>
        <button class="_button add-type-btn" @click="selectColumnType('widget')">
          <i class="ti ti-app-window" />
          <span>Widgets</span>
        </button>
      </template>

      <!-- Step 3a: List selection (for list columns) -->
      <template v-else-if="addListAccountId">
        <div v-if="loadingLists" class="add-popup-empty">Loading...</div>
        <div v-else-if="userLists.length === 0" class="add-popup-empty">No lists found.</div>
        <button
          v-for="list in userLists"
          :key="list.id"
          class="_button add-type-btn"
          @click="addListColumn(list.id, list.name)"
        >
          <i class="ti ti-list" />
          <span>{{ list.name }}</span>
        </button>
      </template>

      <!-- Step 3b: Antenna selection (for antenna columns) -->
      <template v-else-if="addAntennaAccountId">
        <div v-if="loadingAntennas" class="add-popup-empty">Loading...</div>
        <div v-else-if="antennas.length === 0" class="add-popup-empty">No antennas found.</div>
        <button
          v-for="ant in antennas"
          :key="ant.id"
          class="_button add-type-btn"
          @click="addAntennaColumn(ant.id, ant.name)"
        >
          <i class="ti ti-antenna-bars-5" />
          <span>{{ ant.name }}</span>
        </button>
      </template>

      <!-- Step 3b2: Channel selection (for channel columns) -->
      <template v-else-if="addChannelAccountId">
        <div v-if="loadingChannels" class="add-popup-empty">Loading...</div>
        <div v-else-if="channels.length === 0" class="add-popup-empty">No channels found.</div>
        <button
          v-for="ch in channels"
          :key="ch.id"
          class="_button add-type-btn"
          @click="addChannelColumn(ch.id, ch.name)"
        >
          <i class="ti ti-device-tv" />
          <span>{{ ch.name }}</span>
        </button>
      </template>

      <!-- Step 3c: Clip selection (for clip columns) -->
      <template v-else-if="addClipAccountId">
        <div v-if="loadingClips" class="add-popup-empty">Loading...</div>
        <div v-else-if="clips.length === 0" class="add-popup-empty">No clips found.</div>
        <button
          v-for="clip in clips"
          :key="clip.id"
          class="_button add-type-btn"
          @click="addClipColumn(clip.id, clip.name)"
        >
          <i class="ti ti-paperclip" />
          <span>{{ clip.name }}</span>
        </button>
      </template>

      <!-- Step 3d: User search (for user columns) -->
      <template v-else-if="addUserAccountId">
        <div class="add-user-search">
          <input
            v-model="userSearchInput"
            class="add-user-input"
            type="text"
            placeholder="@username or @username@host"
            @keydown.enter="searchAndAddUserColumn"
          />
          <button
            class="_button add-user-submit"
            :disabled="searchingUser || !userSearchInput.trim()"
            @click="searchAndAddUserColumn"
          >
            {{ searchingUser ? '...' : 'Add' }}
          </button>
        </div>
        <div v-if="userSearchError" class="add-popup-empty" style="color: var(--nd-love);">
          {{ userSearchError }}
        </div>
      </template>

      <!-- Step 2: Account selection -->
      <template v-else>
        <div v-if="accountsStore.accounts.length === 0" class="add-popup-empty">
          No accounts registered.
          <router-link to="/login" @click="close()">
            Add account
          </router-link>
        </div>

        <button
          v-for="account in accountsStore.accounts"
          :key="account.id"
          class="_button add-account-btn"
          @click="addColumnForAccount(account.id)"
        >
          <img v-if="account.avatarUrl" :src="account.avatarUrl" class="add-account-avatar" />
          <span>@{{ account.username }}@{{ account.host }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.add-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-modalBg);
}

.add-popup {
  background: var(--nd-popup);
  border-radius: 16px;
  box-shadow: 0 8px 32px var(--nd-shadow);
  min-width: 320px;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
}

.add-popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 24px 16px;
  font-size: 1em;
  font-weight: bold;
  border-bottom: 1px solid var(--nd-divider);
}

.add-popup-empty {
  padding: 2rem;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.6;
  font-size: 0.9em;
}

.add-popup-empty a {
  color: var(--nd-accent);
}

.add-user-search {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
}

.add-user-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--nd-divider);
  border-radius: 6px;
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.85em;
  outline: none;
}

.add-user-input:focus {
  border-color: var(--nd-accent);
}

.add-user-submit {
  padding: 8px 16px;
  border-radius: 6px;
  background: var(--nd-accent);
  color: #fff;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
}

.add-user-submit:disabled {
  opacity: 0.5;
  cursor: default;
}

.add-account-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 24px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  transition: background 0.15s;
}

.add-account-btn:hover {
  background: var(--nd-buttonHoverBg);
}

.add-account-btn + .add-account-btn {
  border-top: 1px solid var(--nd-divider);
}

.add-account-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.add-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  opacity: 0.7;
  transition: background 0.15s, opacity 0.15s;
}

.add-back-btn:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 1;
}

.add-type-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 24px;
  font-size: 0.9em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  transition: background 0.15s;
}

.add-type-btn:hover {
  background: var(--nd-buttonHoverBg);
}

.add-type-btn + .add-type-btn {
  border-top: 1px solid var(--nd-divider);
}

.add-type-btn .ti {
  opacity: 0.7;
  font-size: 18px;
}

@media (max-width: 500px) {
  .add-popup {
    min-width: auto;
    width: calc(100% - 32px);
    max-width: 480px;
  }
}
</style>
