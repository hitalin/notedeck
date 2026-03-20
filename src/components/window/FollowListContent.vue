<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { onMounted, ref, watch } from 'vue'
import { initAdapterFor } from '@/adapters/initAdapter'
import type { NormalizedUser, ServerAdapter } from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import { useNavigation } from '@/composables/useNavigation'
import { useAccountsStore } from '@/stores/accounts'
import { useToast } from '@/stores/toast'

const props = defineProps<{
  accountId: string
  userId: string
  initialTab?: 'following' | 'followers'
}>()

const { navigateToUser: navToUser } = useNavigation()
const accountsStore = useAccountsStore()
const toast = useToast()

type TabType = 'following' | 'followers'
const activeTab = ref<TabType>(props.initialTab ?? 'following')
const users = ref<NormalizedUser[]>([])
const isLoading = ref(false)
const hasMore = ref(true)
const followingIds = ref<Set<string>>(new Set())
const followLoadingIds = ref<Set<string>>(new Set())

const account = accountsStore.accounts.find((a) => a.id === props.accountId)
let adapter: ServerAdapter | null = null

interface FollowRelation {
  id: string
  followee?: NormalizedUser
  follower?: NormalizedUser
}

onMounted(async () => {
  if (!account) return
  try {
    const result = await initAdapterFor(account.host, account.id, {
      pinnedReactions: false,
    })
    adapter = result.adapter
    await loadUsers()
  } catch {
    toast.show('読み込みに失敗しました', 'error')
  }
})

watch(activeTab, () => {
  users.value = []
  hasMore.value = true
  followingIds.value = new Set()
  loadUsers()
})

async function loadUsers(untilId?: string) {
  if (isLoading.value) return
  isLoading.value = true
  try {
    const endpoint =
      activeTab.value === 'following' ? 'users/following' : 'users/followers'
    const params: Record<string, unknown> = {
      userId: props.userId,
      limit: 30,
    }
    if (untilId) params.untilId = untilId
    const result = await invoke<FollowRelation[]>('api_request', {
      accountId: props.accountId,
      endpoint,
      params,
    })
    const fetched = result
      .map((r) => (activeTab.value === 'following' ? r.followee : r.follower))
      .filter((u): u is NormalizedUser => u != null)
    if (fetched.length === 0) {
      hasMore.value = false
    } else {
      users.value = [...users.value, ...fetched]
    }
  } catch {
    toast.show('取得に失敗しました', 'error')
  } finally {
    isLoading.value = false
  }
}

function onScroll(e: Event) {
  if (!hasMore.value || isLoading.value) return
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
    const last = users.value.at(-1)
    if (last) loadUsers(last.id)
  }
}

async function toggleFollow(targetUser: NormalizedUser) {
  if (!adapter || followLoadingIds.value.has(targetUser.id)) return
  followLoadingIds.value = new Set([...followLoadingIds.value, targetUser.id])
  try {
    const isFollowing = followingIds.value.has(targetUser.id)
    if (isFollowing) {
      await adapter.api.unfollowUser(targetUser.id)
      const next = new Set(followingIds.value)
      next.delete(targetUser.id)
      followingIds.value = next
    } else {
      await adapter.api.followUser(targetUser.id)
      followingIds.value = new Set([...followingIds.value, targetUser.id])
    }
  } catch {
    toast.show('操作に失敗しました', 'error')
  } finally {
    const next = new Set(followLoadingIds.value)
    next.delete(targetUser.id)
    followLoadingIds.value = next
  }
}

function navigateUser(userId: string) {
  navToUser(props.accountId, userId)
}
</script>

<template>
  <div :class="$style.followListContent">
    <div :class="$style.tabs">
      <button
        class="_button"
        :class="[$style.tab, { [$style.tabActive]: activeTab === 'following' }]"
        @click="activeTab = 'following'"
      >
        フォロー
      </button>
      <button
        class="_button"
        :class="[$style.tab, { [$style.tabActive]: activeTab === 'followers' }]"
        @click="activeTab = 'followers'"
      >
        フォロワー
      </button>
    </div>

    <div :class="$style.listBody" @scroll="onScroll">
      <button
        v-for="u in users"
        :key="u.id"
        :class="$style.userRow"
        @click="navigateUser(u.id)"
      >
        <MkAvatar :avatar-url="u.avatarUrl" :decorations="u.avatarDecorations" :size="40" />
        <div :class="$style.userInfo">
          <span :class="$style.userName">
            <MkMfm v-if="u.name" :text="u.name" :emojis="u.emojis" :server-host="account?.host" />
            <template v-else>{{ u.username }}</template>
          </span>
          <span :class="$style.userAcct">@{{ u.username }}{{ u.host ? `@${u.host}` : '' }}</span>
        </div>
        <button
          v-if="account?.userId !== u.id"
          class="_button"
          :class="[$style.followBtn, { [$style.followBtnActive]: followingIds.has(u.id) }]"
          :disabled="followLoadingIds.has(u.id)"
          @click.stop="toggleFollow(u)"
        >
          <i v-if="followLoadingIds.has(u.id)" class="ti ti-loader-2" :class="$style.spin" />
          <i v-else-if="followingIds.has(u.id)" class="ti ti-user-check" />
          <i v-else class="ti ti-user-plus" />
        </button>
      </button>

      <div v-if="isLoading" :class="$style.stateMsg">読み込み中...</div>
      <div v-else-if="users.length === 0" :class="$style.stateMsg">
        {{ activeTab === 'following' ? 'フォローしているユーザーはいません' : 'フォロワーはいません' }}
      </div>
    </div>
  </div>
</template>

<style lang="scss" module>
.followListContent {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--nd-bg);
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.tab {
  flex: 1;
  padding: 10px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.6;
  border-bottom: 2px solid transparent;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 1;
  }
}

.tabActive {
  opacity: 1;
  color: var(--nd-accent);
  border-bottom-color: var(--nd-accent);
}

.listBody {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
}

.userRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  width: 100%;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.userInfo {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.userName {
  display: block;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.userAcct {
  display: block;
  font-size: 0.75em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.followBtn {
  flex-shrink: 0;
  padding: 6px 8px;
  border-radius: 6px;
  color: var(--nd-accent);
  transition: background var(--nd-duration-base);

  &:hover {
    background: color-mix(in srgb, var(--nd-accent) 10%, transparent);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.followBtnActive {
  color: var(--nd-success, #4caf50);
}

.stateMsg {
  padding: 24px 16px;
  text-align: center;
  font-size: 0.85em;
  opacity: 0.5;
  color: var(--nd-fg);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
