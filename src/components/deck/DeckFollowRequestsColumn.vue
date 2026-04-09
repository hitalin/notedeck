<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { NormalizedUser } from '@/adapters/types'
import ColumnEmptyState from '@/components/common/ColumnEmptyState.vue'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import { useColumnPullScroller } from '@/composables/useColumnPullScroller'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { useNavigation } from '@/composables/useNavigation'
import { useServerImages } from '@/composables/useServerImages'
import { getAccountAvatarUrl, useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { useToast } from '@/stores/toast'
import { AppError, AUTH_ERROR_MESSAGE } from '@/utils/errors'
import { commands, unwrap } from '@/utils/tauriInvoke'
import DeckColumn from './DeckColumn.vue'

interface FollowRequest {
  id: string
  follower: NormalizedUser
  /** Account that received this request (set in cross-account mode) */
  _accountId?: string
}

const props = defineProps<{
  column: DeckColumnType
}>()

const isCrossAccount = computed(() => props.column.accountId == null)
const accountsStore = useAccountsStore()

const { navigateToUser: navToUser } = useNavigation()
const serversStore = useServersStore()

const { account, columnThemeVars } = useColumnTheme(() => props.column)
const { serverInfoImageUrl, serverNotFoundImageUrl, serverErrorImageUrl } =
  useServerImages(() => props.column)
const isLoggedOut = computed(() => account.value?.hasToken === false)
const toast = useToast()

const serverIconUrl = ref<string | undefined>()
const isLoading = ref(false)
const error = ref<AppError | null>(null)
const requests = ref<FollowRequest[]>([])
const actionStates = ref<Record<string, 'accepted' | 'rejected'>>({})
const scrollContainer = ref<HTMLElement | null>(null)
useColumnPullScroller(scrollContainer)

function scrollToTop() {
  scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

async function fetchRequests() {
  if (isCrossAccount.value) {
    await fetchRequestsCrossAccount()
  } else {
    await fetchRequestsPerAccount()
  }
}

async function fetchRequestsPerAccount() {
  const acc = account.value
  if (!acc) return

  isLoading.value = true
  error.value = null

  try {
    const info = await serversStore.getServerInfo(acc.host)
    serverIconUrl.value = info.iconUrl

    requests.value = unwrap(
      await commands.apiGetFollowRequests(acc.id, 30),
    ) as unknown as FollowRequest[]
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

async function fetchRequestsCrossAccount() {
  isLoading.value = true
  error.value = null
  const accounts = accountsStore.accounts.filter((a) => a.hasToken)

  try {
    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const reqs = unwrap(
          await commands.apiGetFollowRequests(acc.id, 30),
        ) as unknown as FollowRequest[]
        return reqs.map((r) => ({ ...r, _accountId: acc.id }))
      }),
    )

    const allRequests: FollowRequest[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        allRequests.push(...r.value)
      }
    }

    requests.value = allRequests
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
  const accountId = isCrossAccount.value ? req._accountId : account.value?.id
  if (!accountId) return

  try {
    if (action === 'accepted') {
      unwrap(await commands.apiAcceptFollowRequest(accountId, req.follower.id))
    } else {
      unwrap(await commands.apiRejectFollowRequest(accountId, req.follower.id))
    }
    actionStates.value = { ...actionStates.value, [req.id]: action }
  } catch (e) {
    const appErr = AppError.from(e)
    if (appErr.message.includes('NO_SUCH_FOLLOW_REQUEST')) {
      actionStates.value = { ...actionStates.value, [req.id]: action }
    } else {
      toast.show(appErr.message, 'error')
    }
  }
}

function getRequestAccountId(req: FollowRequest): string | undefined {
  return isCrossAccount.value
    ? req._accountId
    : (props.column.accountId ?? undefined)
}

function getRequestServerHost(req: FollowRequest): string | undefined {
  if (isCrossAccount.value && req._accountId) {
    return accountsStore.accounts.find((a) => a.id === req._accountId)?.host
  }
  return account.value?.host
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
    :pull-refresh="fetchRequests"
    @refresh="fetchRequests"
  >
    <template #header-icon>
      <i class="ti ti-user-plus" :class="$style.tlHeaderIcon" />
    </template>

    <template #header-meta>
      <div v-if="!isCrossAccount && account" :class="$style.headerAccount">
        <img :src="getAccountAvatarUrl(account)" :class="$style.headerAvatar" />
        <img :class="$style.headerFavicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <ColumnEmptyState v-if="!isCrossAccount && !account" message="アカウントが見つかりません" :image-url="serverNotFoundImageUrl" />

    <ColumnEmptyState
      v-else-if="error && !isLoggedOut"
      :message="error.isAuth ? AUTH_ERROR_MESSAGE : error.message"
      is-error
      :image-url="serverErrorImageUrl"
    />

    <div v-else :class="$style.frBody">
      <ColumnEmptyState
        v-if="requests.length === 0 && !isLoading"
        message="フォローリクエストはありません"
        :image-url="serverInfoImageUrl"
      />

      <div v-else ref="scrollContainer" :class="$style.frScroller">
        <div
          v-for="req in requests"
          :key="req.id"
          :class="$style.frItem"
        >
          <div :class="$style.frUser" role="button" tabindex="0" @click="getRequestAccountId(req) && navToUser(getRequestAccountId(req)!, req.follower.id)" @keydown.enter="getRequestAccountId(req) && navToUser(getRequestAccountId(req)!, req.follower.id)">
            <MkAvatar
              :avatar-url="req.follower.avatarUrl"
              :decorations="req.follower.avatarDecorations"
              :size="42"
              :is-cat="req.follower.isCat"
            />
            <div :class="$style.frUserInfo">
              <span :class="$style.frDisplayName">
                <MkMfm
                  v-if="req.follower.name"
                  :text="req.follower.name"
                  :server-host="getRequestServerHost(req)"
                  :emojis="req.follower.emojis"
                  plain
                />
                <template v-else>{{ req.follower.username }}</template>
              </span>
              <span :class="$style.frAcct">{{ displayName(req.follower) }}</span>
            </div>
          </div>

          <!-- Cross-account: show which account this request is for -->
          <div v-if="isCrossAccount && req._accountId" :class="$style.frAccountBadge">
            <img
              :src="getAccountAvatarUrl(accountsStore.accounts.find((a) => a.id === req._accountId)!)"
              :class="$style.frAccountAvatar"
            />
            <span :class="$style.frAccountHost">{{ accountsStore.accounts.find((a) => a.id === req._accountId)?.host }}</span>
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
  composes: tlBody from './column-common.module.scss';
}

.frScroller {
  composes: columnScroller from './column-common.module.scss';
}

.frItem {
  padding: 14px 16px;
  border-bottom: 1px solid var(--nd-divider);
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: auto 100px;
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

.frAccountBadge {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding-left: 52px;
  font-size: 0.75em;
  opacity: 0.6;
}

.frAccountAvatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  object-fit: cover;
}

.frAccountHost {
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
