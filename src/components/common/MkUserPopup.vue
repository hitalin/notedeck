<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type { NormalizedUserDetail } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'
import { formatCount } from '@/utils/format'
import MkAvatar from './MkAvatar.vue'
import MkMfm from './MkMfm.vue'

const props = defineProps<{
  userId: string
  accountId: string
  x: number
  y: number
  themeVars?: Record<string, string>
}>()

const emit = defineEmits<{
  close: []
}>()

const serversStore = useServersStore()
const accountsStore = useAccountsStore()

const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === props.accountId),
)
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

// Close on Escape
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="user-popup _popup"
    :style="{ ...themeVars, left: `${x}px`, top: `${y}px` }"
    @mouseleave="handleMouseLeave"
  >
    <div v-if="isLoading" class="popup-loading">読み込み中...</div>
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
          indicator
          :online-status="user.onlineStatus"
          class="popup-avatar"
        />

        <div class="popup-name-area">
          <div class="popup-name">
            <MkMfm v-if="user.name" :text="user.name" :emojis="user.emojis" :server-host="account?.host" />
            <template v-else>{{ user.username }}</template>
          </div>
          <div class="popup-username">@{{ user.username }}{{ user.host ? `@${user.host}` : '' }}</div>
        </div>

        <div v-if="user.description" class="popup-desc">
          <MkMfm :text="user.description" :server-host="account?.host" />
        </div>

        <div class="popup-stats">
          <span><b>{{ formatCount(user.notesCount) }}</b> ノート</span>
          <span><b>{{ formatCount(user.followingCount) }}</b> フォロー</span>
          <span><b>{{ formatCount(user.followersCount) }}</b> フォロワー</span>
        </div>

        <div v-if="user.isFollowed" class="popup-badge">フォローされています</div>

        <button class="popup-webui-link" @click.stop="openUrl(`https://${account?.host}/@${user.username}${user.host ? `@${user.host}` : ''}`)">
          <i class="ti ti-external-link" />
          Web UIで開く
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.user-popup {
  position: fixed;
  z-index: calc(var(--nd-z-popup) + 1);
  width: 300px;
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
  border-radius: 50%;
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
  border-radius: var(--nd-radius-full);
  font-size: 0.7em;
  font-weight: bold;
  background: var(--nd-accentedBg);
  color: var(--nd-accent);
}

.popup-webui-link {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding: 0;
  border: none;
  background: none;
  font-size: 0.8em;
  color: var(--nd-accent);
  cursor: pointer;
  opacity: 0.8;
}

.popup-webui-link:hover {
  opacity: 1;
}

@media (max-width: 500px) {
  .user-popup {
    width: auto;
    max-width: calc(100vw - 32px);
    left: 16px !important;
    right: 16px;
    top: auto !important;
    bottom: calc(60px + var(--nd-safe-area-bottom, env(safe-area-inset-bottom)));
  }
}

/* Mobile platform (viewport may exceed 500px) */
html.nd-mobile .user-popup {
  width: auto;
  max-width: calc(100vw - 32px);
  left: 16px !important;
  right: 16px;
  top: auto !important;
  bottom: calc(60px + var(--nd-safe-area-bottom, env(safe-area-inset-bottom)));
}
</style>
