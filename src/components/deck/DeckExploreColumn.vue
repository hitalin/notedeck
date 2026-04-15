<script setup lang="ts">
import { computed, defineAsyncComponent, ref, useTemplateRef } from 'vue'
import ColumnEmptyState from '@/components/common/ColumnEmptyState.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'
import { commands, unwrap } from '@/utils/tauriInvoke'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)
const MkUserPopup = defineAsyncComponent(
  () => import('@/components/common/MkUserPopup.vue'),
)

import { useHoverPopup } from '@/composables/useHoverPopup'
import { useNavigation } from '@/composables/useNavigation'
import { useNoteColumn } from '@/composables/useNoteColumn'
import { usePortal } from '@/composables/usePortal'
import { useTabSlide } from '@/composables/useTabSlide'
import { getAccountAvatarUrl } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { AppError } from '@/utils/errors'
import type { ColumnTabDef } from './ColumnTabs.vue'
import ColumnTabs from './ColumnTabs.vue'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

// --- Tab ---
type Tab = 'notes' | 'users' | 'roles'
const TAB_DEFS: ColumnTabDef[] = [
  { value: 'notes', label: 'ノート' },
  { value: 'users', label: 'ユーザー' },
  { value: 'roles', label: 'ロール' },
]
const tabs: Tab[] = TAB_DEFS.map((t) => t.value as Tab)
const activeTab = ref<Tab>('notes')
const columnContentRef = ref<HTMLElement | null>(null)

// --- Notes tab (useNoteColumn) ---
const {
  account,
  columnThemeVars,
  serverIconUrl,
  serverInfoImageUrl,
  serverNotFoundImageUrl,
  serverErrorImageUrl,
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
  isPulling,
  isPulledEnough,
  isRefreshing,
  pullDistance,
  displayHeight,
  loadMore,
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
    users.value = unwrap(
      await commands.apiSearchUsers(
        props.column.accountId,
        null,
        'combined',
        '+follower',
        'alive',
        30,
        null,
      ),
    ) as unknown as UserSummary[]
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
    const allRoles = unwrap(
      await commands.apiGetRoles(props.column.accountId),
    ) as unknown as RoleSummary[]
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
    const result = unwrap(
      await commands.apiGetRoleUsers(props.column.accountId, role.id, 30, null),
    ) as unknown as { id: string; user: UserSummary }[]
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
function switchTab(tab: string) {
  const t = tab as Tab
  activeTab.value = t
  if (t === 'users' && !usersFetched.value) fetchUsers()
  if (t === 'roles' && !rolesFetched.value) fetchRoles()
}

// Tab slide animation
const exploreTabIndex = computed(() => tabs.indexOf(activeTab.value))
useTabSlide(exploreTabIndex, columnContentRef)

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

const postPortalRef = useTemplateRef<HTMLElement>('postPortalRef')
usePortal(postPortalRef)

const userPopupPortalRef = useTemplateRef<HTMLElement>('userPopupPortalRef')
usePortal(userPopupPortalRef)

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
    @refresh="refresh"
  >
    <template #header-icon>
      <i class="ti ti-compass" :class="$style.tlHeaderIcon" />
    </template>

    <template #header-meta>
      <button v-if="selectedRole" class="_button" :class="$style.headerRefresh" title="戻る" @click.stop="closeRole">
        <i class="ti ti-arrow-left" />
      </button>
      <div v-if="account" :class="$style.headerAccount">
        <img :src="getAccountAvatarUrl(account)" :class="$style.headerAvatar" />
        <img :class="$style.headerFavicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <ColumnEmptyState
      v-if="!account"
      message="アカウントが見つかりません"
      :image-url="serverNotFoundImageUrl"
    />

    <template v-else>
      <div ref="columnContentRef" :class="$style.exploreContent">
      <ColumnTabs
        :tabs="TAB_DEFS"
        :model-value="activeTab"
        :swipe-target="columnContentRef"
        @update:model-value="switchTab"
      />

      <!-- Notes tab -->
      <template v-if="activeTab === 'notes'">
        <ColumnEmptyState v-if="error" :message="error.message" :image-url="serverErrorImageUrl" is-error />

        <div v-else :class="$style.tlBody">
          <div
            v-if="isPulling"
            :class="$style.pullFrame"
            :style="`--frame-min-height: ${displayHeight()}px`"
          >
            <div :class="$style.pullFrameContent">
              <i v-if="isRefreshing" class="ti ti-loader-2 nd-spin" />
              <i v-else class="ti ti-arrow-bar-to-down" :class="{ refresh: isPulledEnough }" />
              <div :class="$style.pullText">
                <template v-if="isPulledEnough">離してリフレッシュ</template>
                <template v-else-if="isRefreshing">リフレッシュ中…</template>
                <template v-else>下に引いてリフレッシュ</template>
              </div>
            </div>
          </div>
          <div v-if="isLoading && notes.length === 0" :class="$style.columnLoading">
            <LoadingSpinner />
          </div>
          <template v-if="!(isLoading && notes.length === 0)">
            <NoteScroller ref="noteScrollerRef" :items="notes" :focused-id="focusedNoteId" :class="$style.tlScroller" @scroll="handleScroll" @near-end="loadMore">
              <template #default="{ item, index }">
                <div>
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
                    @delete-and-edit="handlers.deleteAndEdit"
                    @vote="handlers.vote"
                  />
                </div>
              </template>
            </NoteScroller>
          </template>
        </div>
      </template>

      <!-- Users tab -->
      <template v-else-if="activeTab === 'users'">
        <div :class="$style.exploreList">
          <div v-if="usersLoading" :class="$style.columnLoading"><LoadingSpinner /></div>
          <ColumnEmptyState v-else-if="usersError" :message="usersError" :image-url="serverErrorImageUrl" is-error />
          <ColumnEmptyState v-else-if="users.length === 0" message="ユーザーが見つかりません" :image-url="serverInfoImageUrl" />
          <button
            v-for="user in users"
            :key="user.id"
            class="_button"
            :class="$style.exploreUserCard"
            @click="onUserClick(user.id)"
            @mouseenter="onUserMouseEnter($event, user.id)"
            @mouseleave="onUserMouseLeave"
          >
            <img v-if="user.avatarUrl" :src="user.avatarUrl" :class="$style.exploreUserAvatar" />
            <div :class="$style.exploreUserInfo">
              <div :class="$style.exploreUserName">
                <span v-if="user.name" :class="$style.exploreUserDisplayName">{{ user.name }}</span>
                <span :class="$style.exploreUserAcct">@{{ user.username }}<template v-if="user.host">@{{ user.host }}</template></span>
              </div>
              <div v-if="user.description" :class="$style.exploreUserDesc">{{ user.description }}</div>
              <div :class="$style.exploreUserMeta">
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
          <div :class="$style.exploreRoleHeader">
            <span v-if="selectedRole.iconUrl" :class="$style.exploreRoleIcon">
              <img :src="selectedRole.iconUrl" />
            </span>
            <span>{{ selectedRole.name }}</span>
          </div>
          <div :class="$style.exploreList">
            <div v-if="roleUsersLoading" :class="$style.columnLoading"><LoadingSpinner /></div>
            <ColumnEmptyState v-else-if="roleUsersError" :message="roleUsersError" :image-url="serverErrorImageUrl" is-error />
            <ColumnEmptyState v-else-if="roleUsers.length === 0" message="ユーザーがいません" :image-url="serverInfoImageUrl" />
            <button
              v-for="user in roleUsers"
              :key="user.id"
              class="_button"
              :class="$style.exploreUserCard"
              @click="onUserClick(user.id)"
              @mouseenter="onUserMouseEnter($event, user.id)"
              @mouseleave="onUserMouseLeave"
            >
              <img v-if="user.avatarUrl" :src="user.avatarUrl" :class="$style.exploreUserAvatar" />
              <div :class="$style.exploreUserInfo">
                <div :class="$style.exploreUserName">
                  <span v-if="user.name" :class="$style.exploreUserDisplayName">{{ user.name }}</span>
                  <span :class="$style.exploreUserAcct">@{{ user.username }}<template v-if="user.host">@{{ user.host }}</template></span>
                </div>
              </div>
            </button>
          </div>
        </template>

        <!-- Roles list -->
        <template v-else>
          <div :class="$style.exploreList">
            <div v-if="rolesLoading" :class="$style.columnLoading"><LoadingSpinner /></div>
            <ColumnEmptyState v-else-if="rolesError" :message="rolesError" :image-url="serverErrorImageUrl" is-error />
            <ColumnEmptyState v-else-if="roles.length === 0" message="ロールが見つかりません" :image-url="serverInfoImageUrl" />
            <button
              v-for="role in roles"
              :key="role.id"
              class="_button"
              :class="$style.exploreRoleCard"
              @click="openRole(role)"
            >
              <span v-if="role.iconUrl" :class="$style.exploreRoleIcon">
                <img :src="role.iconUrl" />
              </span>
              <div :class="$style.exploreRoleInfo">
                <div :class="$style.exploreRoleName" :style="role.color ? { color: role.color } : undefined">{{ role.name }}</div>
                <div v-if="role.description" :class="$style.exploreRoleDesc">{{ role.description }}</div>
                <div :class="$style.exploreRoleMeta">
                  <i class="ti ti-users" /> {{ role.usersCount }}
                </div>
              </div>
            </button>
          </div>
        </template>
      </template>
      </div>
    </template>
  </DeckColumn>

  <div v-if="postForm.show.value && column.accountId && account?.hasToken" ref="postPortalRef">
    <MkPostForm
      :account-id="column.accountId"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      :initial-text="postForm.initialText.value"
      :initial-cw="postForm.initialCw.value"
      :initial-visibility="postForm.initialVisibility.value"
      @close="postForm.close"
      @posted="handlePosted"
    />
  </div>
  <div v-if="userPopup.isVisible.value && column.accountId" ref="userPopupPortalRef">
    <MkUserPopup
      :user-id="hoverUserId"
      :account-id="column.accountId"
      :x="userPopup.position.value.x"
      :y="userPopup.position.value.y"
      @close="closeUserPopup"
    />
  </div>
</template>

<style lang="scss" module>
@use './column-common.module.scss';
.exploreContent {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* --- List --- */
.exploreList {
  composes: columnScroller from './column-common.module.scss';
}

/* --- User card --- */
.exploreUserCard {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--nd-divider);
  transition: background var(--nd-duration-base);
  cursor: pointer;
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: auto 75px;

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.exploreUserAvatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  flex-shrink: 0;
}

.exploreUserInfo {
  flex: 1;
  min-width: 0;
}

.exploreUserName {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
}

.exploreUserDisplayName {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
}

.exploreUserAcct {
  font-size: 0.8em;
  opacity: 0.6;
}

.exploreUserDesc {
  margin-top: 4px;
  font-size: 0.8em;
  opacity: 0.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.exploreUserMeta {
  margin-top: 4px;
  font-size: 0.75em;
  opacity: 0.5;
  display: flex;
  align-items: center;
  gap: 3px;
}

/* --- Role card --- */
.exploreRoleCard {
  display: flex;
  gap: 10px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--nd-divider);
  transition: background var(--nd-duration-base);
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: auto 65px;

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.exploreRoleIcon img {
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
}

.exploreRoleInfo {
  flex: 1;
  min-width: 0;
}

.exploreRoleName {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
}

.exploreRoleDesc {
  margin-top: 2px;
  font-size: 0.8em;
  opacity: 0.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.exploreRoleMeta {
  margin-top: 4px;
  font-size: 0.75em;
  opacity: 0.5;
  display: flex;
  align-items: center;
  gap: 3px;
}

.exploreRoleHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 0.85em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;

  img {
    width: 20px;
    height: 20px;
    border-radius: 4px;
  }
}
</style>
