<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'

const props = defineProps<{
  message: ChatMessage
  myUserId?: string
}>()

const isMine = computed(
  () => props.myUserId && props.message.fromUserId === props.myUserId,
)

const displayUser = computed(() => {
  const u = props.message.fromUser
  if (!u) return null
  return {
    name: u.name || u.username,
    avatarUrl: u.avatarUrl ?? null,
    username: u.username,
    host: u.host ?? null,
  }
})

const timeStr = computed(() => {
  const d = new Date(props.message.createdAt)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
})
</script>

<template>
  <div class="chat-msg" :class="{ mine: isMine }">
    <MkAvatar
      v-if="!isMine && displayUser"
      class="chat-avatar"
      :avatar-url="displayUser.avatarUrl"
      :size="32"
    />
    <div class="chat-bubble">
      <div v-if="!isMine && displayUser" class="chat-sender">
        {{ displayUser.name }}
      </div>
      <div v-if="message.text" class="chat-text">{{ message.text }}</div>
      <div v-if="message.file" class="chat-file">
        <img
          v-if="message.file.type.startsWith('image/')"
          :src="message.file.thumbnailUrl || message.file.url"
          class="chat-image"
          loading="lazy"
        />
        <a v-else :href="message.file.url" target="_blank" rel="noopener">
          {{ message.file.name }}
        </a>
      </div>
      <div class="chat-time">{{ timeStr }}</div>
    </div>
  </div>
</template>

<style scoped>
.chat-msg {
  display: flex;
  align-items: flex-end;
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
}

.chat-bubble {
  max-width: 75%;
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
  border-radius: 8px;
  object-fit: contain;
}

.chat-time {
  font-size: 0.7em;
  opacity: 0.5;
  text-align: right;
  margin-top: 2px;
}
</style>
