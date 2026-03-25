<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import MkMfm from '@/components/common/MkMfm.vue'
import { getAccountAvatarUrl, useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { useThemeStore } from '@/stores/theme'
import { AppError } from '@/utils/errors'
import { formatTime } from '@/utils/formatTime'
import { invoke } from '@/utils/tauriInvoke'
import DeckColumn from './DeckColumn.vue'

interface Announcement {
  id: string
  createdAt: string
  updatedAt: string | null
  title: string
  text: string
  imageUrl: string | null
  icon: 'info' | 'warning' | 'error' | 'success'
  display: 'dialog' | 'normal' | 'banner'
  needConfirmationToRead: boolean
  silence: boolean
  forYou: boolean
  isRead: boolean
}

const props = defineProps<{
  column: DeckColumnType
}>()

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
const announcements = ref<Announcement[]>([])
const scrollContainer = ref<HTMLElement | null>(null)

const ICON_MAP: Record<string, string> = {
  info: 'info-circle',
  warning: 'alert-triangle',
  error: 'circle-x',
  success: 'circle-check',
}

const ICON_COLOR_MAP: Record<string, string> = {
  info: 'var(--nd-accent)',
  warning: 'var(--nd-warn, #e8a530)',
  error: 'var(--nd-love)',
  success: 'var(--nd-renote, #36d298)',
}

function scrollToTop() {
  scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

async function fetchAnnouncements() {
  const acc = account.value
  if (!acc) return

  isLoading.value = true
  error.value = null

  try {
    const info = await serversStore.getServerInfo(acc.host)
    serverIconUrl.value = info.iconUrl

    announcements.value = await invoke<Announcement[]>(
      'api_get_announcements',
      {
        accountId: acc.id,
        limit: 20,
        isActive: true,
      },
    )
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

async function markAsRead(announcement: Announcement) {
  if (announcement.isRead) return
  const acc = account.value
  if (!acc) return

  try {
    await invoke('api_read_announcement', {
      accountId: acc.id,
      announcementId: announcement.id,
    })
    announcement.isRead = true
    announcements.value = [...announcements.value]
  } catch {
    // non-critical
  }
}

onMounted(() => {
  fetchAnnouncements()
})

onUnmounted(() => {
  // cleanup if needed
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    title="お知らせ"
    :theme-vars="columnThemeVars"
    refreshable
    :refreshing="isLoading"
    @header-click="scrollToTop"
    @refresh="fetchAnnouncements"
  >
    <template #header-icon>
      <i class="ti ti-speakerphone" :class="$style.tlHeaderIcon" />
    </template>

    <template #header-meta>
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

    <div v-else :class="$style.announcementsBody">
      <div
        v-if="announcements.length === 0 && !isLoading"
        :class="$style.columnEmpty"
      >
        お知らせはありません
      </div>

      <div v-else ref="scrollContainer" :class="$style.announcementsScroller">
        <div
          v-for="item in announcements"
          :key="item.id"
          :class="[$style.announcementItem, { [$style.unread]: !item.isRead }]"
        >
          <div :class="$style.announcementHeader">
            <i
              :class="`ti ti-${ICON_MAP[item.icon] || 'info-circle'}`"
              :style="{ color: ICON_COLOR_MAP[item.icon] || 'var(--nd-accent)' }"
            />
            <span :class="$style.announcementTitle">{{ item.title }}</span>
            <span :class="$style.announcementTime">{{ formatTime(item.createdAt) }}</span>
          </div>

          <div v-if="item.imageUrl" :class="$style.announcementImage">
            <img :src="item.imageUrl" loading="lazy" />
          </div>

          <div :class="$style.announcementText">
            <MkMfm :text="item.text" :server-host="account?.host" />
          </div>

          <div v-if="!item.isRead" :class="$style.announcementActions">
            <button class="_button" :class="$style.announcementReadBtn" @click="markAsRead(item)">
              <i class="ti ti-check" /> 既読にする
            </button>
          </div>
        </div>
      </div>
    </div>
  </DeckColumn>
</template>

<style lang="scss" module>
@use './column-common.module.scss';
.announcementsBody {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.announcementsScroller {
  flex: 1;
  overflow-y: auto;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.announcementItem {
  padding: 16px;
  border-bottom: 1px solid var(--nd-divider);

  &.unread {
    background: var(--nd-accentedBg);
  }
}

.announcementHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.announcementTitle {
  flex: 1;
  min-width: 0;
  font-weight: bold;
  font-size: 0.95em;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcementTime {
  flex-shrink: 0;
  font-size: 0.8em;
  opacity: 0.5;
}

.announcementImage {
  margin-bottom: 8px;

  img {
    max-width: 100%;
    border-radius: var(--nd-radius-md);
  }
}

.announcementText {
  font-size: 0.9em;
  line-height: 1.6;
  color: var(--nd-fg);
  word-break: break-word;
}

.announcementActions {
  margin-top: 10px;
}

.announcementReadBtn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  font-size: 0.85em;
  font-weight: bold;
  border-radius: var(--nd-radius-full);
  background: var(--nd-accent);
  color: #fff;
  cursor: pointer;
  transition: filter var(--nd-duration-base);

  &:hover {
    filter: brightness(1.1);
  }
}
</style>
