<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { createAdapter } from '@/adapters/registry'
import type { NoteReaction } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'

const MkUserPopup = defineAsyncComponent(() => import('./MkUserPopup.vue'))

const props = defineProps<{
  noteId: string
  accountId: string
  serverHost: string
  reaction: string
  reactionUrl: string | null
  totalCount: number
  x: number
  y: number
}>()

const emit = defineEmits<{
  close: []
}>()

const router = useRouter()
const serversStore = useServersStore()
const accountsStore = useAccountsStore()

const reactions = ref<NoteReaction[]>([])
const isLoading = ref(true)

// User hover popup
const showUserPopup = ref(false)
const userPopupUserId = ref('')
const userPopupPos = ref({ x: 0, y: 0 })
const userPopupTheme = ref<Record<string, string>>({})
let hoverTimer: ReturnType<typeof setTimeout> | null = null

async function fetchReactions() {
  isLoading.value = true
  reactions.value = []
  try {
    const account = accountsStore.accounts.find((a) => a.id === props.accountId)
    if (!account) return
    const serverInfo = await serversStore.getServerInfo(account.host)
    const adapter = createAdapter(serverInfo, account.id)
    reactions.value = await adapter.api.getNoteReactions(
      props.noteId,
      props.reaction,
      11,
    )
  } catch {
    // Non-critical popup
  } finally {
    isLoading.value = false
  }
}

watch(() => props.reaction, fetchReactions, { immediate: true })

function handleMouseLeave() {
  if (showUserPopup.value) return
  emit('close')
}

function onUserClick(userId: string) {
  const path = `/user/${props.accountId}/${userId}`
  emit('close')
  router.push(path)
}

function onUserMouseEnter(e: MouseEvent, userId: string) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  userPopupPos.value = { x: rect.right + 8, y: rect.top }
  userPopupUserId.value = userId

  // Copy theme CSS vars from nearest column for the Teleported popup
  const column = document.querySelector('.deck-column') as HTMLElement | null
  if (column) {
    const vars: Record<string, string> = {}
    for (const attr of column.style) {
      if (attr.startsWith('--nd-')) {
        vars[attr] = column.style.getPropertyValue(attr)
      }
    }
    userPopupTheme.value = vars
  }

  hoverTimer = setTimeout(() => {
    showUserPopup.value = true
  }, 400)
}

function onUserMouseLeave() {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
}

function closeUserPopup() {
  showUserPopup.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (hoverTimer) clearTimeout(hoverTimer)
})
</script>

<template>
  <div
    class="reaction-users-popup"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @mouseleave="handleMouseLeave"
  >
    <div v-if="isLoading" class="popup-loading">Loading...</div>
    <template v-else>
      <div v-if="reactions.length === 0" class="popup-loading">No reactions</div>
      <template v-else>
        <button
          v-for="r in reactions.slice(0, 10)"
          :key="r.id"
          class="reaction-user-row"
          @click.stop="onUserClick(r.user.id)"
          @mouseenter="onUserMouseEnter($event, r.user.id)"
          @mouseleave="onUserMouseLeave"
        >
          <img
            v-if="r.user.avatarUrl"
            :src="r.user.avatarUrl"
            class="reaction-user-avatar"
            width="24"
            height="24"
            loading="lazy"
            decoding="async"
          />
          <div v-else class="reaction-user-avatar reaction-user-avatar-placeholder" />
          <div class="reaction-user-info">
            <span class="reaction-user-name">{{ r.user.name || r.user.username }}</span>
            <span class="reaction-user-username">@{{ r.user.username }}</span>
          </div>
        </button>
        <div v-if="totalCount > 10" class="reaction-users-more">
          and {{ totalCount - 10 }} more
        </div>
      </template>
    </template>
  </div>

  <Teleport to="body">
    <div v-if="showUserPopup" :style="userPopupTheme">
      <MkUserPopup
        :user-id="userPopupUserId"
        :account-id="accountId"
        :x="userPopupPos.x"
        :y="userPopupPos.y"
        @close="closeUserPopup"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.reaction-users-popup {
  position: fixed;
  z-index: 10001;
  width: 240px;
  background: var(--nd-popup);
  border-radius: 10px;
  box-shadow: 0 4px 24px var(--nd-shadow);
  padding: 8px 0;
  pointer-events: auto;
}

/* Invisible bridge to catch the mouse in the gap between badge and popup */
.reaction-users-popup::before {
  content: '';
  position: absolute;
  top: -8px;
  left: 0;
  right: 0;
  height: 8px;
}

.popup-loading {
  padding: 12px 16px;
  text-align: center;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.5;
}

.reaction-user-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  width: 100%;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.reaction-user-row:hover {
  background: var(--nd-buttonHoverBg);
}

.reaction-user-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.reaction-user-avatar-placeholder {
  background: var(--nd-buttonBg);
}

.reaction-user-info {
  min-width: 0;
  overflow: hidden;
}

.reaction-user-name {
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.reaction-user-username {
  font-size: 0.75em;
  opacity: 0.6;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reaction-users-more {
  padding: 6px 12px 4px;
  font-size: 0.75em;
  opacity: 0.5;
  text-align: center;
}
</style>
