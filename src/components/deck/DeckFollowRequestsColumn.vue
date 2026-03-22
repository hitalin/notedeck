<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { NormalizedUser } from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { useNavigation } from '@/composables/useNavigation'
import { getAccountAvatarUrl } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { AppError } from '@/utils/errors'
import { invoke } from '@/utils/tauriInvoke'
import DeckColumn from './DeckColumn.vue'

interface FollowRequest {
  id: string
  follower: NormalizedUser
}

const props = defineProps<{
  column: DeckColumnType
}>()

const { navigateToUser: navToUser } = useNavigation()
const serversStore = useServersStore()

const { account, columnThemeVars } = useColumnTheme(() => props.column)

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

    requests.value = await invoke<FollowRequest[]>('api_get_follow_requests', {
      accountId: acc.id,
      limit: 30,
    })
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

async function handleAction(
  req: FollowRequest,
  action: 'accepted' | 'rejected',
) {
  const acc = account.value
  if (!acc) return

  try {
    const command =
      action === 'accepted'
        ? 'api_accept_follow_request'
        : 'api_reject_follow_request'
    await invoke(command, {
      accountId: acc.id,
      userId: req.follower.id,
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
      <i class="ti ti-user-plus" :class="$style.tlHeaderIcon" />
    </template>

    <template #header-meta>
      <button class="_button" :class="$style.headerRefresh" title="更新" :disabled="isLoading" @click.stop="fetchRequests">
        <i class="ti ti-refresh" :class="{ [String($style.spin)]: isLoading }" />
      </button>
      <div v-if="account" :class="$style.headerAccount">
        <img :src="getAccountAvatarUrl(account)" :class="$style.headerAvatar" />
        <img :class="$style.headerFavicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <div v-if="!account" :class="$style.columnEmpty">
      Account not found
    </div>

    <div v-else-if="error" :class="[$style.columnEmpty, $style.columnError]">
      {{ error.message }}
    </div>

    <div v-else :class="$style.frBody">
      <div v-if="isLoading && requests.length === 0">
        <MkSkeleton v-for="i in 3" :key="i" />
      </div>

      <div
        v-else-if="requests.length === 0"
        :class="$style.columnEmpty"
      >
        フォローリクエストはありません
      </div>

      <div v-else ref="scrollContainer" :class="$style.frScroller">
        <div
          v-for="req in requests"
          :key="req.id"
          :class="$style.frItem"
        >
          <div :class="$style.frUser" @click="column.accountId && navToUser(column.accountId, req.follower.id)">
            <MkAvatar
              :avatar-url="req.follower.avatarUrl"
              :decorations="req.follower.avatarDecorations"
              :size="42"
            />
            <div :class="$style.frUserInfo">
              <span :class="$style.frDisplayName">
                <MkMfm
                  v-if="req.follower.name"
                  :text="req.follower.name"
                  :server-host="account?.host"
                  :emojis="req.follower.emojis"
                  plain
                />
                <template v-else>{{ req.follower.username }}</template>
              </span>
              <span :class="$style.frAcct">{{ displayName(req.follower) }}</span>
            </div>
          </div>

          <div :class="$style.frActions">
            <template v-if="actionStates[req.id]">
              <span :class="$style.frDone">
                {{ actionStates[req.id] === 'accepted' ? '承認済み' : '拒否済み' }}
              </span>
            </template>
            <template v-else>
              <button :class="[$style.frBtn, $style.acceptBtn]" @click="handleAction(req, 'accepted')">
                <i class="ti ti-check" /> 承認
              </button>
              <button :class="[$style.frBtn, $style.rejectBtn]" @click="handleAction(req, 'rejected')">
                <i class="ti ti-x" /> 拒否
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </DeckColumn>
</template>

<style lang="scss" module>
@use './column-common.module.scss';

.frBody {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.frScroller {
  flex: 1;
  overflow-y: auto;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.frItem {
  padding: 14px 16px;
  border-bottom: 1px solid var(--nd-divider);
}

.frUser {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;

  &:hover .frDisplayName {
    text-decoration: underline;
  }
}

.frUserInfo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.frDisplayName {
  font-weight: bold;
  font-size: 0.9em;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.frAcct {
  font-size: 0.8em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.frActions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-left: 52px;
}

.frBtn {
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
  border-radius: var(--nd-radius-full);
  cursor: pointer;
  transition: filter var(--nd-duration-base);
}

.acceptBtn {
  background: var(--nd-link);
  color: #fff;

  &:hover {
    filter: brightness(1.1);
  }
}

.rejectBtn {
  background: transparent;
  color: var(--nd-love);

  &:hover {
    background: var(--nd-love-subtle);
  }
}

.frDone {
  font-size: 0.85em;
  opacity: 0.6;
  font-style: italic;
}
</style>
