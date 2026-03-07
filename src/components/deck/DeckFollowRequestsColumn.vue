<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, onMounted, ref } from 'vue'
import type { NormalizedUser } from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useNavigation } from '@/composables/useNavigation'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { useThemeStore } from '@/stores/theme'
import { AppError } from '@/utils/errors'
import DeckColumn from './DeckColumn.vue'

interface FollowRequest {
  id: string
  follower: NormalizedUser
}

const props = defineProps<{
  column: DeckColumnType
}>()

const { navigateToUser: navToUser } = useNavigation()
const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const themeStore = useThemeStore()

const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === props.column.accountId),
)

const columnThemeVars = computed(() => {
  const accountId = props.column.accountId
  if (!accountId) return undefined
  return themeStore.getStyleVarsForAccount(accountId)
})

const serverIconUrl = ref<string | undefined>()
const isLoading = ref(false)
const error = ref<AppError | null>(null)
const requests = ref<FollowRequest[]>([])
const actionStates = ref<Record<string, 'accepted' | 'rejected'>>({})
const scrollContainer = ref<HTMLElement | null>(null)

function scrollToTop() {
  scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

async function fetchRequests() {
  const acc = account.value
  if (!acc) return

  isLoading.value = true
  error.value = null

  try {
    const info = await serversStore.getServerInfo(acc.host)
    serverIconUrl.value = info.iconUrl

    requests.value = await invoke<FollowRequest[]>('api_request', {
      accountId: acc.id,
      endpoint: 'following/requests/list',
      params: { limit: 30 },
    })
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

async function handleAction(req: FollowRequest, action: 'accepted' | 'rejected') {
  const acc = account.value
  if (!acc) return

  try {
    const endpoint = action === 'accepted'
      ? 'following/requests/accept'
      : 'following/requests/reject'
    await invoke('api_request', {
      accountId: acc.id,
      endpoint,
      params: { userId: req.follower.id },
    })
    actionStates.value = { ...actionStates.value, [req.id]: action }
  } catch (e) {
    error.value = AppError.from(e)
  }
}

function displayName(user: NormalizedUser): string {
  if (user.host) return `@${user.username}@${user.host}`
  return `@${user.username}`
}

onMounted(() => {
  fetchRequests()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name || 'フォローリクエスト'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop"
  >
    <template #header-icon>
      <i class="ti ti-user-plus tl-header-icon" />
    </template>

    <template #header-meta>
      <button class="_button header-refresh" title="更新" :disabled="isLoading" @click.stop="fetchRequests">
        <i class="ti ti-refresh" :class="{ 'spin': isLoading }" />
      </button>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img class="header-favicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="error" class="column-empty column-error">
      {{ error.message }}
    </div>

    <div v-else class="fr-body">
      <div v-if="isLoading && requests.length === 0">
        <MkSkeleton v-for="i in 3" :key="i" />
      </div>

      <div
        v-else-if="requests.length === 0"
        class="column-empty"
      >
        フォローリクエストはありません
      </div>

      <div v-else ref="scrollContainer" class="fr-scroller">
        <div
          v-for="req in requests"
          :key="req.id"
          class="fr-item"
        >
          <div class="fr-user" @click="navToUser(req.follower.id, column.accountId ?? undefined)">
            <MkAvatar
              :avatar-url="req.follower.avatarUrl"
              :decorations="req.follower.avatarDecorations"
              :size="42"
              class="fr-avatar"
            />
            <div class="fr-user-info">
              <span class="fr-display-name">
                <MkMfm
                  v-if="req.follower.name"
                  :text="req.follower.name"
                  :server-host="account?.host"
                  :emojis="req.follower.emojis"
                  plain
                />
                <template v-else>{{ req.follower.username }}</template>
              </span>
              <span class="fr-acct">{{ displayName(req.follower) }}</span>
            </div>
          </div>

          <div class="fr-actions">
            <template v-if="actionStates[req.id]">
              <span class="fr-done">
                {{ actionStates[req.id] === 'accepted' ? '承認済み' : '拒否済み' }}
              </span>
            </template>
            <template v-else>
              <button class="fr-btn accept-btn" @click="handleAction(req, 'accepted')">
                <i class="ti ti-check" /> 承認
              </button>
              <button class="fr-btn reject-btn" @click="handleAction(req, 'rejected')">
                <i class="ti ti-x" /> 拒否
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </DeckColumn>
</template>

<style scoped>
@import "./column-common.css";

.fr-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fr-scroller {
  flex: 1;
  overflow-y: auto;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.fr-item {
  padding: 14px 16px;
  border-bottom: 1px solid var(--nd-divider);
}

.fr-user {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.fr-user:hover .fr-display-name {
  text-decoration: underline;
}

.fr-user-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fr-display-name {
  font-weight: bold;
  font-size: 0.9em;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fr-acct {
  font-size: 0.8em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fr-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-left: 52px;
}

.fr-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 100px;
  padding: 7px 14px;
  font-weight: bold;
  font-size: 0.85em;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  transition: filter 0.15s;
}

.accept-btn {
  background: var(--nd-link);
  color: #fff;
}

.accept-btn:hover {
  filter: brightness(1.1);
}

.reject-btn {
  background: transparent;
  color: var(--nd-love);
}

.reject-btn:hover {
  background: color-mix(in srgb, var(--nd-love) 10%, transparent);
}

.fr-done {
  font-size: 0.85em;
  opacity: 0.6;
  font-style: italic;
}
</style>
