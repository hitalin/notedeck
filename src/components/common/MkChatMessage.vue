<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, defineAsyncComponent, ref } from 'vue'
import type { ChatMessage, NormalizedUser } from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { useHoverPopup } from '@/composables/useHoverPopup'
import { proxyUrl } from '@/utils/imageProxy'

const MkUserPopup = defineAsyncComponent(() => import('./MkUserPopup.vue'))

const props = defineProps<{
  message: ChatMessage
  myUserId?: string
  accountId?: string
  serverHost?: string
}>()

const emit = defineEmits<{
  react: [messageId: string, reaction: string]
  unreact: [messageId: string, reaction: string]
}>()

const { reactionUrl } = useEmojiResolver()

const isMine = computed(
  () => props.myUserId && props.message.fromUserId === props.myUserId,
)

const displayUser = computed(() => {
  const u = props.message.fromUser
  if (!u) return null
  return {
    name: u.name || u.username,
    avatarUrl: u.avatarUrl ?? null,
    avatarDecorations: u.avatarDecorations ?? [],
    username: u.username,
    host: u.host ?? null,
  }
})

const timeStr = computed(() => {
  const d = new Date(props.message.createdAt)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
})

const lightboxUrl = ref<string | null>(null)

function openLightbox(url: string) {
  lightboxUrl.value = url
}

function closeLightbox() {
  lightboxUrl.value = null
}

// Group reactions: { reaction, count, users[], avatarUrls[], reacted (by me) }
const groupedReactions = computed(() => {
  const reactions = props.message.reactions
  if (!reactions || reactions.length === 0) return []

  const map = new Map<
    string,
    {
      reaction: string
      count: number
      users: string[]
      avatarUrls: (string | null)[]
      reacted: boolean
    }
  >()
  for (const r of reactions) {
    const userName = r.user ? r.user.name || r.user.username : ''
    const avatarUrl = r.user?.avatarUrl ?? null
    const isMe = r.user ? r.user.id === props.myUserId : false
    const existing = map.get(r.reaction)
    if (existing) {
      existing.count++
      if (userName) existing.users.push(userName)
      existing.avatarUrls.push(avatarUrl)
      if (isMe) existing.reacted = true
    } else {
      map.set(r.reaction, {
        reaction: r.reaction,
        count: 1,
        users: userName ? [userName] : [],
        avatarUrls: [avatarUrl],
        reacted: isMe,
      })
    }
  }
  return Array.from(map.values())
})

function getReactionImageUrl(reaction: string): string | null {
  if (!props.serverHost) return null
  return reactionUrl(reaction, {}, {}, props.serverHost)
}

function handleReactionClick(reaction: string, reacted: boolean) {
  if (reacted) {
    emit('unreact', props.message.id, reaction)
  } else {
    emit('react', props.message.id, reaction)
  }
}

// User hover popup for mentions
const mentionPopup = useHoverPopup()
const mentionUserId = ref('')
let mentionHovering = false

async function onMentionHover(
  e: MouseEvent,
  username: string,
  host: string | null,
) {
  if (!props.accountId) return
  mentionHovering = true
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  try {
    const user = await invoke<NormalizedUser>('api_lookup_user', {
      accountId: props.accountId,
      username,
      host: host ?? null,
    })
    if (!mentionHovering) return
    mentionUserId.value = user.id
    mentionPopup.show({ x: rect.right + 8, y: rect.top })
  } catch {
    // lookup failed — don't show popup
  }
}

function onMentionLeave() {
  mentionHovering = false
  mentionPopup.hide()
}

function closeMentionPopup() {
  mentionPopup.forceClose()
}
</script>

<template>
  <div class="chat-msg" :class="{ mine: isMine }">
    <MkAvatar
      v-if="!isMine && displayUser"
      class="chat-avatar"
      :avatar-url="displayUser.avatarUrl"
      :decorations="displayUser.avatarDecorations"
      :size="32"
    />
    <div class="chat-bubble-wrapper">
      <div class="chat-bubble">
        <div v-if="!isMine && displayUser" class="chat-sender">
          {{ displayUser.name }}
        </div>
        <div v-if="message.text" class="chat-text">
          <MkMfm :text="message.text" :account-id="accountId" :server-host="serverHost" @mention-hover="onMentionHover" @mention-leave="onMentionLeave" />
        </div>
        <div v-if="message.file" class="chat-file">
          <img
            v-if="message.file.type.startsWith('image/')"
            :src="message.file.thumbnailUrl || message.file.url"
            class="chat-image"
            loading="lazy"
            @click="openLightbox(message.file!.url)"
          />
          <a v-else :href="message.file.url" target="_blank" rel="noopener">
            {{ message.file.name }}
          </a>
        </div>
        <div class="chat-time">{{ timeStr }}</div>
      </div>

      <!-- Reactions -->
      <div v-if="groupedReactions.length > 0" class="chat-reactions">
        <button
          v-for="r in groupedReactions"
          :key="r.reaction"
          class="chat-reaction-pill"
          :class="{ reacted: r.reacted }"
          :title="r.users.join(', ')"
          @click="handleReactionClick(r.reaction, r.reacted)"
        >
          <span class="reaction-avatars">
            <img
              v-for="(url, i) in r.avatarUrls.slice(0, 3)"
              :key="i"
              :src="url ? proxyUrl(url) : ''"
              class="reaction-avatar"
              :style="{ marginLeft: i > 0 ? '-6px' : '0' }"
              decoding="async"
              loading="lazy"
            />
          </span>
          <img
            v-if="getReactionImageUrl(r.reaction)"
            :src="proxyUrl(getReactionImageUrl(r.reaction)!)"
            :alt="r.reaction"
            class="reaction-emoji-img"
            decoding="async"
            loading="lazy"
          />
          <span v-else class="reaction-emoji-text">{{ r.reaction }}</span>
          <span v-if="r.count > 1" class="reaction-count">{{ r.count }}</span>
        </button>
      </div>

      <!-- Add reaction button -->
      <button
        class="chat-add-reaction"
        title="リアクション"
        @click.stop="emit('react', message.id, '')"
      >
        <i class="ti ti-mood-plus" />
      </button>
    </div>
  </div>

  <Teleport to="body">
    <MkUserPopup
      v-if="mentionPopup.isVisible.value && mentionUserId"
      :user-id="mentionUserId"
      :account-id="accountId!"
      :x="mentionPopup.position.value.x"
      :y="mentionPopup.position.value.y"
      @close="closeMentionPopup"
    />
  </Teleport>

  <Teleport to="body">
    <div v-if="lightboxUrl" class="lightbox-overlay" @click="closeLightbox">
      <button class="lightbox-close" @click="closeLightbox">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
      <img
        :src="lightboxUrl"
        class="lightbox-image"
        @click.stop
      />
    </div>
  </Teleport>
</template>

<style scoped>
.chat-msg {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 12px;
}

.chat-msg.mine {
  flex-direction: row-reverse;
}

.chat-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  margin-top: 4px;
}

.chat-bubble-wrapper {
  max-width: 75%;
  position: relative;
}

.chat-bubble-wrapper:hover .chat-add-reaction {
  opacity: 1;
}

.chat-bubble {
  padding: 8px 12px;
  border-radius: 14px;
  background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.05));
  font-size: 0.95em;
  line-height: 1.5;
  word-break: break-word;
}

.mine .chat-bubble {
  background: var(--nd-accentedBg, rgba(134, 179, 0, 0.15));
  border-bottom-right-radius: 4px;
}

.chat-msg:not(.mine) .chat-bubble {
  border-bottom-left-radius: 4px;
}

.chat-sender {
  font-size: 0.8em;
  font-weight: 600;
  opacity: 0.7;
  margin-bottom: 2px;
}

.chat-text {
  white-space: pre-wrap;
}

.chat-file {
  margin-top: 4px;
}

.chat-image {
  max-width: 100%;
  max-height: 200px;
  border-radius: var(--nd-radius-md);
  object-fit: contain;
  cursor: pointer;
}

.chat-time {
  font-size: 0.7em;
  opacity: 0.5;
  text-align: right;
  margin-top: 2px;
}

/* Reactions */
.chat-reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.mine .chat-reactions {
  justify-content: flex-end;
}

.chat-reaction-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 10px;
  border: 1px solid var(--nd-divider, rgba(255, 255, 255, 0.1));
  background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.05));
  color: var(--nd-fg);
  font-size: 0.8em;
  cursor: pointer;
  line-height: 1.4;
}

.chat-reaction-pill:hover {
  background: var(--nd-buttonHoverBg, rgba(255, 255, 255, 0.1));
}

.chat-reaction-pill.reacted {
  border-color: var(--nd-accent);
  background: var(--nd-accentedBg, rgba(134, 179, 0, 0.15));
}

.reaction-avatars {
  display: inline-flex;
  align-items: center;
}

.reaction-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid var(--nd-panel, #1a1a1a);
}

.reaction-emoji-img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.reaction-emoji-text {
  font-size: 1.1em;
}

.reaction-count {
  font-size: 0.85em;
  opacity: 0.7;
}

/* Add reaction button */
.chat-add-reaction {
  position: absolute;
  top: 2px;
  border: none;
  background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.08));
  color: var(--nd-fg);
  opacity: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.85em;
  transition: opacity var(--nd-duration-base);
}

.chat-msg:not(.mine) .chat-add-reaction {
  right: -28px;
}

.mine .chat-add-reaction {
  left: -28px;
}

.chat-add-reaction:hover {
  background: var(--nd-buttonHoverBg, rgba(255, 255, 255, 0.15));
}

/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup);
  background: var(--nd-overlayLightbox);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: var(--nd-modalBg);
  border: none;
  color: white;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 1;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.lightbox-image {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  cursor: default;
}
</style>
