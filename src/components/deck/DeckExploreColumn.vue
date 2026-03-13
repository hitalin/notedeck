<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, defineAsyncComponent, ref } from 'vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)
const MkUserPopup = defineAsyncComponent(
  () => import('@/components/common/MkUserPopup.vue'),
)

import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useHoverPopup } from '@/composables/useHoverPopup'
import { useNavigation } from '@/composables/useNavigation'
import { useNoteColumn } from '@/composables/useNoteColumn'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { AppError } from '@/utils/errors'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

// --- Tab ---
type Tab = 'notes' | 'users' | 'roles'
const activeTab = ref<Tab>('notes')

// --- Notes tab (useNoteColumn) ---
const {
  account,
  columnThemeVars,
  serverIconUrl,
  isLoading,
  error,
  notes,
  focusedNoteId,
  postForm,
  handlers,
  noteScrollerRef,
  scrollToTop,
  handleScroll,
  handlePosted,
  removeNote,
  refresh: refreshNotes,
  pullDistance,
  isRefreshing,
} = useNoteColumn({
  getColumn: () => props.column,
  fetch: async (adapter, opts) => {
    if (opts.untilId) return []
    return adapter.api.getFeaturedNotes({ limit: 30 })
  },
  cache: {
    getKey: () => 'explore',
  },
})

// --- Users tab ---
interface UserSummary {
  id: string
  username: string
  host: string | null
  name: string | null
  avatarUrl: string | null
  followersCount: number
  description: string | null
}

const users = ref<UserSummary[]>([])
const usersLoading = ref(false)
const usersError = ref<string | null>(null)
const usersFetched = ref(false)

async function fetchUsers() {
  if (!props.column.accountId) return
  usersLoading.value = true
  usersError.value = null
  try {
    users.value = await invoke<UserSummary[]>('api_request', {
      accountId: props.column.accountId,
      endpoint: 'users',
      params: {
        limit: 30,
        sort: '+follower',
        state: 'alive',
        origin: 'combined',
      },
    })
    usersFetched.value = true
  } catch (e) {
    usersError.value = AppError.from(e).message
  } finally {
    usersLoading.value = false
  }
}

// --- Roles tab ---
interface RoleSummary {
  id: string
  name: string
  description: string | null
  color: string | null
  iconUrl: string | null
  usersCount: number
  target: string
  displayOrder: number
}

const roles = ref<RoleSummary[]>([])
const rolesLoading = ref(false)
const rolesError = ref<string | null>(null)
const rolesFetched = ref(false)

// Role users
const roleUsers = ref<UserSummary[]>([])
const roleUsersLoading = ref(false)
const roleUsersError = ref<string | null>(null)
const selectedRole = ref<RoleSummary | null>(null)

async function fetchRoles() {
  if (!props.column.accountId) return
  rolesLoading.value = true
  rolesError.value = null
  try {
    const allRoles = await invoke<RoleSummary[]>('api_request', {
      accountId: props.column.accountId,
      endpoint: 'roles/list',
      params: {},
    })
    roles.value = allRoles
      .filter((r) => r.target === 'manual')
      .sort((a, b) => b.displayOrder - a.displayOrder)
    rolesFetched.value = true
  } catch (e) {
    rolesError.value = AppError.from(e).message
  } finally {
    rolesLoading.value = false
  }
}

async function openRole(role: RoleSummary) {
  if (!props.column.accountId) return
  selectedRole.value = role
  roleUsersLoading.value = true
  roleUsersError.value = null
  roleUsers.value = []
  try {
    const result = await invoke<{ id: string; user: UserSummary }[]>(
      'api_request',
      {
        accountId: props.column.accountId,
        endpoint: 'roles/users',
        params: { roleId: role.id, limit: 30 },
      },
    )
    roleUsers.value = result.map((entry) => entry.user)
  } catch (e) {
    roleUsersError.value = AppError.from(e).message
  } finally {
    roleUsersLoading.value = false
  }
}

function closeRole() {
  selectedRole.value = null
  roleUsers.value = []
}

// --- Tab switching ---
function switchTab(tab: Tab) {
  activeTab.value = tab
  if (tab === 'users' && !usersFetched.value) fetchUsers()
  if (tab === 'roles' && !rolesFetched.value) fetchRoles()
}

function refresh() {
  if (activeTab.value === 'notes') {
    refreshNotes()
  } else if (activeTab.value === 'users') {
    usersFetched.value = false
    fetchUsers()
  } else {
    rolesFetched.value = false
    selectedRole.value = null
    fetchRoles()
  }
}

const currentLoading = computed(() => {
  if (activeTab.value === 'notes') return isLoading.value
  if (activeTab.value === 'users') return usersLoading.value
  return rolesLoading.value
})

// --- User interaction ---
const { navigateToUser } = useNavigation()
const userPopup = useHoverPopup()
const hoverUserId = ref('')

function onUserClick(userId: string) {
  if (!props.column.accountId) return
  navigateToUser(props.column.accountId, userId)
}

function onUserMouseEnter(e: MouseEvent, userId: string) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  hoverUserId.value = userId
  userPopup.show({ x: rect.right + 8, y: rect.top })
}

function onUserMouseLeave() {
  userPopup.hide()
}

function closeUserPopup() {
  userPopup.forceClose()
}
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name || 'みつける'"
    :theme-vars="columnThemeVars"
    @header-click="activeTab === 'notes' ? scrollToTop() : undefined"
  >
    <template #header-icon>
      <i class="ti ti-compass tl-header-icon" />
    </template>

    <template #header-meta>
      <button v-if="selectedRole" class="_button header-refresh" title="Back" @click.stop="closeRole">
        <i class="ti ti-arrow-left" />
      </button>
      <button v-else class="_button header-refresh" title="Refresh" :disabled="currentLoading" @click.stop="refresh">
        <i class="ti ti-refresh" :class="{ spin: currentLoading }" />
      </button>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img class="header-favicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <template v-else>
      <!-- Tabs -->
      <div class="explore-tabs">
        <button
          v-for="tab in (['notes', 'users', 'roles'] as Tab[])"
          :key="tab"
          class="_button explore-tab"
          :class="{ active: activeTab === tab }"
          @click="switchTab(tab)"
        >
          {{ tab === 'notes' ? 'ノート' : tab === 'users' ? 'ユーザー' : 'ロール' }}
        </button>
      </div>

      <!-- Notes tab -->
      <template v-if="activeTab === 'notes'">
        <div v-if="error" class="column-empty column-error">
          {{ error.message }}
        </div>

        <div v-else class="tl-body">
          <div
            v-if="pullDistance > 0 || isRefreshing"
            class="pull-indicator"
            :style="{ height: pullDistance + 'px' }"
          >
            <i class="ti" :class="isRefreshing ? 'ti-loader-2 spin' : 'ti-arrow-down'" :style="{ opacity: Math.min(pullDistance / 64, 1), transform: pullDistance >= 64 && !isRefreshing ? 'rotate(180deg)' : '' }" />
          </div>
          <div v-if="isLoading && notes.length === 0">
            <MkSkeleton v-for="i in 5" :key="i" />
          </div>

          <template v-else>
            <NoteScroller ref="noteScrollerRef" :items="notes" class="tl-scroller" @scroll="handleScroll">
              <template #default="{ item, index }">
                <div :data-index="index">
                  <MkNote
                    :note="item"
                    :focused="item.id === focusedNoteId"
                    @react="handlers.reaction"
                    @reply="handlers.reply"
                    @renote="handlers.renote"
                    @quote="handlers.quote"
                    @delete="removeNote"
                    @edit="handlers.edit"
                    @bookmark="handlers.bookmark"
                  />
                </div>
              </template>
            </NoteScroller>
          </template>
        </div>
      </template>

      <!-- Users tab -->
      <template v-else-if="activeTab === 'users'">
        <div class="explore-list">
          <div v-if="usersLoading" class="column-empty">読み込み中...</div>
          <div v-else-if="usersError" class="column-empty column-error">{{ usersError }}</div>
          <div v-else-if="users.length === 0" class="column-empty">ユーザーが見つかりません</div>
          <button
            v-for="user in users"
            :key="user.id"
            class="_button explore-user-card"
            @click="onUserClick(user.id)"
            @mouseenter="onUserMouseEnter($event, user.id)"
            @mouseleave="onUserMouseLeave"
          >
            <img v-if="user.avatarUrl" :src="user.avatarUrl" class="explore-user-avatar" />
            <div class="explore-user-info">
              <div class="explore-user-name">
                <span v-if="user.name" class="explore-user-display-name">{{ user.name }}</span>
                <span class="explore-user-acct">@{{ user.username }}<template v-if="user.host">@{{ user.host }}</template></span>
              </div>
              <div v-if="user.description" class="explore-user-desc">{{ user.description }}</div>
              <div class="explore-user-meta">
                <i class="ti ti-users" /> {{ user.followersCount }}
              </div>
            </div>
          </button>
        </div>
      </template>

      <!-- Roles tab -->
      <template v-else>
        <!-- Role users detail -->
        <template v-if="selectedRole">
          <div class="explore-role-header">
            <span v-if="selectedRole.iconUrl" class="explore-role-icon">
              <img :src="selectedRole.iconUrl" />
            </span>
            <span>{{ selectedRole.name }}</span>
          </div>
          <div class="explore-list">
            <div v-if="roleUsersLoading" class="column-empty">読み込み中...</div>
            <div v-else-if="roleUsersError" class="column-empty column-error">{{ roleUsersError }}</div>
            <div v-else-if="roleUsers.length === 0" class="column-empty">ユーザーがいません</div>
            <button
              v-for="user in roleUsers"
              :key="user.id"
              class="_button explore-user-card"
              @click="onUserClick(user.id)"
              @mouseenter="onUserMouseEnter($event, user.id)"
              @mouseleave="onUserMouseLeave"
            >
              <img v-if="user.avatarUrl" :src="user.avatarUrl" class="explore-user-avatar" />
              <div class="explore-user-info">
                <div class="explore-user-name">
                  <span v-if="user.name" class="explore-user-display-name">{{ user.name }}</span>
                  <span class="explore-user-acct">@{{ user.username }}<template v-if="user.host">@{{ user.host }}</template></span>
                </div>
              </div>
            </button>
          </div>
        </template>

        <!-- Roles list -->
        <template v-else>
          <div class="explore-list">
            <div v-if="rolesLoading" class="column-empty">読み込み中...</div>
            <div v-else-if="rolesError" class="column-empty column-error">{{ rolesError }}</div>
            <div v-else-if="roles.length === 0" class="column-empty">ロールが見つかりません</div>
            <button
              v-for="role in roles"
              :key="role.id"
              class="_button explore-role-card"
              @click="openRole(role)"
            >
              <span v-if="role.iconUrl" class="explore-role-icon">
                <img :src="role.iconUrl" />
              </span>
              <div class="explore-role-info">
                <div class="explore-role-name" :style="role.color ? { color: role.color } : undefined">{{ role.name }}</div>
                <div v-if="role.description" class="explore-role-desc">{{ role.description }}</div>
                <div class="explore-role-meta">
                  <i class="ti ti-users" /> {{ role.usersCount }}
                </div>
              </div>
            </button>
          </div>
        </template>
      </template>
    </template>
  </DeckColumn>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && column.accountId"
      :account-id="column.accountId"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      @close="postForm.close"
      @posted="handlePosted"
    />
    <MkUserPopup
      v-if="userPopup.isVisible.value && column.accountId"
      :user-id="hoverUserId"
      :account-id="column.accountId"
      :x="userPopup.position.value.x"
      :y="userPopup.position.value.y"
      @close="closeUserPopup"
    />
  </Teleport>
</template>

<style scoped>
@import "./column-common.css";

.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  color: var(--nd-accent);
  font-size: 1.2em;
  transition: height var(--nd-duration-slow) ease;
}

.pull-indicator .ti {
  transition: transform var(--nd-duration-slow) ease, opacity var(--nd-duration-slow) ease;
}

/* --- Tabs --- */

.explore-tabs {
  display: flex;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.explore-tab {
  flex: 1;
  padding: 8px 0;
  text-align: center;
  font-size: 0.8em;
  font-weight: 600;
  color: var(--nd-fg);
  opacity: 0.5;
  transition: opacity var(--nd-duration-base), border-color var(--nd-duration-base);
  border-bottom: 2px solid transparent;
}

.explore-tab:hover {
  opacity: 0.8;
}

.explore-tab.active {
  opacity: 1;
  color: var(--nd-accent);
  border-bottom-color: var(--nd-accent);
}

/* --- List --- */

.explore-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

/* --- User card --- */

.explore-user-card {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--nd-divider);
  transition: background var(--nd-duration-base);
  cursor: pointer;
}

.explore-user-card:hover {
  background: var(--nd-buttonHoverBg);
}

.explore-user-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  flex-shrink: 0;
}

.explore-user-info {
  flex: 1;
  min-width: 0;
}

.explore-user-name {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
}

.explore-user-display-name {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
}

.explore-user-acct {
  font-size: 0.8em;
  opacity: 0.6;
}

.explore-user-desc {
  margin-top: 4px;
  font-size: 0.8em;
  opacity: 0.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.explore-user-meta {
  margin-top: 4px;
  font-size: 0.75em;
  opacity: 0.5;
  display: flex;
  align-items: center;
  gap: 3px;
}

/* --- Role card --- */

.explore-role-card {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--nd-divider);
  transition: background var(--nd-duration-base);
}

.explore-role-card:hover {
  background: var(--nd-buttonHoverBg);
}

.explore-role-icon img {
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
}

.explore-role-info {
  flex: 1;
  min-width: 0;
}

.explore-role-name {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
}

.explore-role-desc {
  margin-top: 2px;
  font-size: 0.8em;
  opacity: 0.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.explore-role-meta {
  margin-top: 4px;
  font-size: 0.75em;
  opacity: 0.5;
  display: flex;
  align-items: center;
  gap: 3px;
}

.explore-role-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 0.85em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.explore-role-header img {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}
</style>
