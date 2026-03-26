<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type { NoteReaction } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'
import { proxyUrl } from '@/utils/imageProxy'
import MkEmoji from './MkEmoji.vue'
import MkMfm from './MkMfm.vue'

const PREVIEW_LIMIT = 10

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
  openModal: [reaction: string]
}>()

const serversStore = useServersStore()
const accountsStore = useAccountsStore()

const reactions = ref<NoteReaction[]>([])
const isLoading = ref(true)

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
      PREVIEW_LIMIT,
    )
  } catch {
    // Non-critical tooltip
  } finally {
    isLoading.value = false
  }
}

watch(() => props.reaction, fetchReactions, { immediate: true })

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    :class="$style.root"
    class="_popup reaction-users-popup"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @mouseleave="emit('close')"
  >
    <template v-if="!isLoading || reactions.length > 0">
      <!-- Left: reaction icon + name -->
      <div :class="$style.reaction">
        <img
          v-if="reactionUrl"
          :src="proxyUrl(reactionUrl)"
          :alt="reaction"
          :class="$style.reactionIcon"
          decoding="async"
          loading="lazy"
        />
        <MkEmoji v-else :emoji="reaction" :class="$style.reactionIcon" />
      </div>

      <!-- Right: user list -->
      <div :class="$style.users">
        <div v-for="r in reactions" :key="r.id" :class="$style.user">
          <img
            v-if="r.user.avatarUrl"
            :src="r.user.avatarUrl"
            :class="$style.avatar"
            width="24"
            height="24"
            loading="lazy"
            decoding="async"
          />
          <div v-else :class="[$style.avatar, $style.avatarPlaceholder]" />
          <span :class="$style.userName">
            <MkMfm v-if="r.user.name" :text="r.user.name" :emojis="r.user.emojis" :server-host="serverHost" />
            <template v-else>{{ r.user.username }}</template>
          </span>
        </div>
        <button
          v-if="totalCount > PREVIEW_LIMIT"
          :class="$style.more"
          @click.stop="emit('openModal', reaction)"
        >
          +{{ totalCount - reactions.length }}
        </button>
      </div>
    </template>
  </div>
</template>

<style lang="scss" module>
.root {
  position: fixed;
  z-index: calc(var(--nd-z-popup) + 1);
  display: flex;
  align-items: stretch;
  max-width: 340px;
  padding: 8px 12px;
  pointer-events: auto;

  /* Bridge to catch the mouse in the gap between badge and tooltip */
  &::before {
    content: '';
    position: absolute;
    top: -8px;
    left: 0;
    right: 0;
    height: 8px;
  }
}

.reaction {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-right: 10px;
  margin-right: 10px;
  border-right: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.reactionIcon {
  height: 32px;
  width: auto;
  max-width: 120px;
  object-fit: contain;
}

.users {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-height: 96px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.user {
  display: flex;
  align-items: center;
  gap: 6px;
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.avatarPlaceholder {
  background: var(--nd-buttonBg);
}

.userName {
  font-size: 0.85em;
  color: var(--nd-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more {
  padding: 0;
  border: none;
  background: none;
  color: var(--nd-accent);
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  text-align: left;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.7;
  }
}
</style>
