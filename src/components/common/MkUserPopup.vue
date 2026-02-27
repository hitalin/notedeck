<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type { NormalizedUserDetail } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'
import MkAvatar from './MkAvatar.vue'

const props = defineProps<{
  userId: string
  accountId: string
  x: number
  y: number
}>()

const emit = defineEmits<{
  close: []
}>()

const serversStore = useServersStore()
const accountsStore = useAccountsStore()

const user = ref<NormalizedUserDetail | null>(null)
const isLoading = ref(true)

onMounted(async () => {
  try {
    const account = accountsStore.accounts.find((a) => a.id === props.accountId)
    if (!account) return
    const serverInfo = await serversStore.getServerInfo(account.host)
    const adapter = createAdapter(serverInfo, account.id)
    user.value = await adapter.api.getUserDetail(props.userId)
  } catch {
    // Silently fail — popup is non-critical
  } finally {
    isLoading.value = false
  }
})

function handleMouseLeave() {
  emit('close')
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

// Close on Escape
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="user-popup"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @mouseleave="handleMouseLeave"
  >
    <div v-if="isLoading" class="popup-loading">Loading...</div>
    <template v-else-if="user">
      <div class="popup-banner">
        <div
          v-if="user.bannerUrl"
          class="popup-banner-img"
          :style="{ backgroundImage: `url(${user.bannerUrl})` }"
        />
        <div v-else class="popup-banner-img popup-banner-empty" />
      </div>
      <div class="popup-body">
        <MkAvatar
          :avatar-url="user.avatarUrl"
          :decorations="user.avatarDecorations"
          :size="56"
          class="popup-avatar"
        />

        <div class="popup-name-area">
          <div class="popup-name">{{ user.name || user.username }}</div>
          <div class="popup-username">@{{ user.username }}{{ user.host ? `@${user.host}` : '' }}</div>
        </div>

        <p v-if="user.description" class="popup-desc">{{ user.description }}</p>

        <div class="popup-stats">
          <span><b>{{ formatCount(user.notesCount) }}</b> Notes</span>
          <span><b>{{ formatCount(user.followingCount) }}</b> Following</span>
          <span><b>{{ formatCount(user.followersCount) }}</b> Followers</span>
        </div>

        <div v-if="user.isFollowed" class="popup-badge">Follows you</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.user-popup {
  position: fixed;
  z-index: 10001;
  width: 300px;
  background: var(--nd-popup);
  border-radius: 12px;
  box-shadow: 0 4px 24px var(--nd-shadow);
  overflow: hidden;
  pointer-events: auto;
}

.popup-loading {
  padding: 24px;
  text-align: center;
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.5;
}

.popup-banner-img {
  width: 100%;
  height: 80px;
  background-color: #4c5e6d;
  background-size: cover;
  background-position: center;
}

.popup-banner-empty {
  background: linear-gradient(135deg, #4c5e6d, #6b8a9e);
}

.popup-body {
  padding: 0 16px 16px;
  position: relative;
}

.popup-avatar {
  border: 3px solid var(--nd-popup);
  margin-top: -28px;
}

.popup-name-area {
  margin-top: 4px;
}

.popup-name {
  font-weight: bold;
  font-size: 1em;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.popup-username {
  font-size: 0.8em;
  opacity: 0.6;
}

.popup-desc {
  margin: 8px 0 0;
  font-size: 0.85em;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.popup-stats {
  display: flex;
  gap: 12px;
  margin-top: 10px;
  font-size: 0.8em;
  opacity: 0.7;
}

.popup-stats b {
  color: var(--nd-fgHighlighted);
}

.popup-badge {
  display: inline-block;
  margin-top: 8px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.7em;
  font-weight: bold;
  background: var(--nd-accentedBg);
  color: var(--nd-accent);
}
</style>
