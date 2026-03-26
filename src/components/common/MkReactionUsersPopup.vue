<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type { NoteReaction } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'
import { proxyUrl } from '@/utils/imageProxy'
import MkEmoji from './MkEmoji.vue'

const PREVIEW_LIMIT = 5

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
const remaining = ref(0)

async function fetchReactions() {
  isLoading.value = true
  reactions.value = []
  try {
    const account = accountsStore.accounts.find((a) => a.id === props.accountId)
    if (!account) return
    const serverInfo = await serversStore.getServerInfo(account.host)
    const adapter = createAdapter(serverInfo, account.id)
    const result = await adapter.api.getNoteReactions(
      props.noteId,
      props.reaction,
      PREVIEW_LIMIT,
    )
    reactions.value = result
    remaining.value = Math.max(0, props.totalCount - result.length)
  } catch {
    // Non-critical tooltip
  } finally {
    isLoading.value = false
  }
}

watch(() => props.reaction, fetchReactions, { immediate: true })

function openModal() {
  emit('openModal', props.reaction)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    :class="$style.tooltip"
    class="_popup reaction-users-popup"
    :style="{ left: `${x}px`, top: `${y}px` }"
    @mouseleave="emit('close')"
  >
    <template v-if="!isLoading || reactions.length > 0">
      <!-- Reaction emoji -->
      <img
        v-if="reactionUrl"
        :src="proxyUrl(reactionUrl)"
        :alt="reaction"
        :class="$style.reactionEmoji"
        decoding="async"
        loading="lazy"
      />
      <MkEmoji v-else :emoji="reaction" :class="$style.reactionEmoji" />

      <!-- Avatars -->
      <div :class="$style.avatars">
        <img
          v-for="r in reactions"
          :key="r.id"
          :src="r.user.avatarUrl ?? ''"
          :alt="r.user.name ?? r.user.username"
          :title="r.user.name ?? r.user.username"
          :class="$style.avatar"
          width="24"
          height="24"
          loading="lazy"
          decoding="async"
        />
      </div>

      <!-- "+N" badge → opens modal -->
      <button
        v-if="remaining > 0"
        :class="$style.more"
        @click.stop="openModal"
      >
        +{{ remaining }}
      </button>
    </template>
  </div>
</template>

<style lang="scss" module>
.tooltip {
  position: fixed;
  z-index: calc(var(--nd-z-popup) + 1);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  pointer-events: auto;
  white-space: nowrap;

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

.reactionEmoji {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
}

.avatars {
  display: flex;
  align-items: center;
}

.avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--nd-popup, var(--nd-panel));
  margin-left: -6px;

  &:first-child {
    margin-left: 0;
  }
}

.more {
  padding: 2px 8px;
  border: none;
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  font-size: 0.75em;
  font-weight: bold;
  border-radius: 10px;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background var(--nd-duration-base),
    color var(--nd-duration-base);

  &:hover {
    background: var(--nd-accent);
    color: #fff;
  }
}
</style>
