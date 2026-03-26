<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type { NoteReaction } from '@/adapters/types'
import { useNavigation } from '@/composables/useNavigation'
import { useAccountsStore } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'
import { extractThemeVars } from '@/utils/themeVars'
import MkMfm from './MkMfm.vue'

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

const { navigateToUser } = useNavigation()
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
  emit('close')
  navigateToUser(props.accountId, userId)
}

function onUserMouseEnter(e: MouseEvent, userId: string) {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }

  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  userPopupPos.value = { x: rect.right + 8, y: rect.top }
  userPopupUserId.value = userId

  const column = document.querySelector('.deck-column') as HTMLElement | null
  if (column) userPopupTheme.value = extractThemeVars(column)

  if (showUserPopup.value) return // Already showing — key change triggers re-render

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
    :class="$style.reactionUsersPopup"
    class="_popup reaction-users-popup"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @mouseleave="handleMouseLeave"
  >
    <div v-if="isLoading" :class="$style.popupLoading">読み込み中...</div>
    <template v-else>
      <div v-if="reactions.length === 0" :class="$style.popupLoading">リアクションなし</div>
      <template v-else>
        <button
          v-for="r in reactions.slice(0, 10)"
          :key="r.id"
          :class="$style.reactionUserRow"
          @click.stop="onUserClick(r.user.id)"
          @mouseenter="onUserMouseEnter($event, r.user.id)"
          @mouseleave="onUserMouseLeave"
        >
          <img
            v-if="r.user.avatarUrl"
            :src="r.user.avatarUrl"
            :class="$style.reactionUserAvatar"
            width="24"
            height="24"
            loading="lazy"
            decoding="async"
          />
          <div v-else :class="[$style.reactionUserAvatar, $style.reactionUserAvatarPlaceholder]" />
          <div :class="$style.reactionUserInfo">
            <span :class="$style.reactionUserName">
              <MkMfm v-if="r.user.name" :text="r.user.name" :emojis="r.user.emojis" :server-host="serverHost" />
              <template v-else>{{ r.user.username }}</template>
            </span>
            <span :class="$style.reactionUserUsername">@{{ r.user.username }}</span>
          </div>
        </button>
        <div v-if="totalCount > 10" :class="$style.reactionUsersMore">
          and {{ totalCount - 10 }} more
        </div>
      </template>
    </template>
  </div>

  <Teleport to="body">
    <div v-if="showUserPopup" :style="userPopupTheme">
      <MkUserPopup
        :key="userPopupUserId"
        :user-id="userPopupUserId"
        :account-id="accountId"
        :x="userPopupPos.x"
        :y="userPopupPos.y"
        @close="closeUserPopup"
      />
    </div>
  </Teleport>
</template>

<style lang="scss" module>
.reactionUsersPopup {
  position: fixed;
  z-index: calc(var(--nd-z-popup) + 1);
  width: 240px;
  padding: 8px 0;
  pointer-events: auto;

  /* Invisible bridge to catch the mouse in the gap between badge and popup */
  &::before {
    content: '';
    position: absolute;
    top: -8px;
    left: 0;
    right: 0;
    height: 8px;
  }
}

.popupLoading {
  padding: 12px 16px;
  text-align: center;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.5;
}

.reactionUserRow {
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
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.reactionUserAvatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.reactionUserAvatarPlaceholder {
  background: var(--nd-buttonBg);
}

.reactionUserInfo {
  min-width: 0;
  overflow: hidden;
}

.reactionUserName {
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.reactionUserUsername {
  font-size: 0.75em;
  opacity: 0.6;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reactionUsersMore {
  padding: 6px 12px 4px;
  font-size: 0.75em;
  opacity: 0.5;
  text-align: center;
}
</style>
