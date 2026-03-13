<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import MkMfm from '@/components/common/MkMfm.vue'
import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { useThemeStore } from '@/stores/theme'
import { AppError } from '@/utils/errors'
import { formatTime } from '@/utils/formatTime'
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

    announcements.value = await invoke<Announcement[]>('api_request', {
      accountId: acc.id,
      endpoint: 'announcements',
      params: { limit: 20, isActive: true },
    })
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
    await invoke('api_request', {
      accountId: acc.id,
      endpoint: 'i/read-announcement',
      params: { announcementId: announcement.id },
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
    @header-click="scrollToTop"
  >
    <template #header-icon>
      <i class="ti ti-speakerphone tl-header-icon" />
    </template>

    <template #header-meta>
      <button class="_button header-refresh" title="更新" :disabled="isLoading" @click.stop="fetchAnnouncements">
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

    <div v-else class="announcements-body">
      <div v-if="isLoading && announcements.length === 0">
        <MkSkeleton v-for="i in 3" :key="i" />
      </div>

      <div
        v-else-if="announcements.length === 0"
        class="column-empty"
      >
        お知らせはありません
      </div>

      <div v-else ref="scrollContainer" class="announcements-scroller">
        <div
          v-for="item in announcements"
          :key="item.id"
          class="announcement-item"
          :class="{ unread: !item.isRead }"
        >
          <div class="announcement-header">
            <i
              :class="`ti ti-${ICON_MAP[item.icon] || 'info-circle'}`"
              class="announcement-icon"
              :style="{ color: ICON_COLOR_MAP[item.icon] || 'var(--nd-accent)' }"
            />
            <span class="announcement-title">{{ item.title }}</span>
            <span class="announcement-time">{{ formatTime(item.createdAt) }}</span>
          </div>

          <div v-if="item.imageUrl" class="announcement-image">
            <img :src="item.imageUrl" loading="lazy" />
          </div>

          <div class="announcement-text">
            <MkMfm :text="item.text" :server-host="account?.host" />
          </div>

          <div v-if="!item.isRead" class="announcement-actions">
            <button class="_button announcement-read-btn" @click="markAsRead(item)">
              <i class="ti ti-check" /> 既読にする
            </button>
          </div>
        </div>
      </div>
    </div>
  </DeckColumn>
</template>

<style scoped>
@import "./column-common.css";

.announcements-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.announcements-scroller {
  flex: 1;
  overflow-y: auto;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}

.announcement-item {
  padding: 16px;
  border-bottom: 1px solid var(--nd-divider);
}

.announcement-item.unread {
  background: var(--nd-accentedBg);
}

.announcement-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.announcement-icon {
  flex-shrink: 0;
  font-size: 1.1em;
}

.announcement-title {
  flex: 1;
  min-width: 0;
  font-weight: bold;
  font-size: 0.95em;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-time {
  flex-shrink: 0;
  font-size: 0.8em;
  opacity: 0.5;
}

.announcement-image {
  margin-bottom: 8px;
}

.announcement-image img {
  max-width: 100%;
  border-radius: var(--nd-radius-md);
}

.announcement-text {
  font-size: 0.9em;
  line-height: 1.6;
  color: var(--nd-fg);
  word-break: break-word;
}

.announcement-actions {
  margin-top: 10px;
}

.announcement-read-btn {
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
  transition: filter 0.15s;
}

.announcement-read-btn:hover {
  filter: brightness(1.1);
}
</style>
