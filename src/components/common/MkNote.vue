<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { NormalizedNote } from '@/adapters/types'
import { useEmojisStore } from '@/stores/emojis'
import { splitTextWithEmoji, char2twemojiUrl } from '@/utils/twemoji'
import MkEmoji from './MkEmoji.vue'

const props = defineProps<{
  note: NormalizedNote
  detailed?: boolean
}>()

/** Pure renote → show inner note, otherwise show note itself */
const effectiveNote = computed(() =>
  props.note.renote && props.note.text === null ? props.note.renote : props.note,
)
const isPureRenote = computed(() => props.note.renote && props.note.text === null)

const emit = defineEmits<{
  react: [reaction: string]
  reply: [note: NormalizedNote]
  renote: [note: NormalizedNote]
  quote: [note: NormalizedNote]
}>()

const router = useRouter()
const emojisStore = useEmojisStore()
const showReactionInput = ref(false)
const showRenoteMenu = ref(false)

function navigateToDetail() {
  if (!props.detailed) {
    router.push(`/note/${props.note._accountId}/${props.note.id}`)
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

/** Resolve emoji shortcode to URL using note data + server cache */
function resolveEmoji(shortcode: string): string | null {
  const n = effectiveNote.value
  const base = shortcode.replace(/@\.$/, '')
  // Note-level emojis (remote emojis)
  return n.emojis[shortcode] || n.emojis[base]
    // Reaction emojis
    || n.reactionEmojis[shortcode] || n.reactionEmojis[base]
    // Server-level emoji cache (local emojis)
    || emojisStore.resolve(n._serverHost, base)
}

/** Resolve reaction key to emoji URL or null (Unicode emoji) */
function reactionUrl(reaction: string): string | null {
  if (reaction.startsWith(':') && reaction.endsWith(':')) {
    return resolveEmoji(reaction.slice(1, -1))
  }
  return null
}

/** Parse text into segments: plain text, custom emoji, and Unicode emoji (twemoji) */
const textSegments = computed(() => {
  const text = effectiveNote.value.text
  if (!text) return []

  // Pass 1: extract custom emoji :shortcode:
  const customSegments: { type: 'text' | 'emoji'; value: string; url?: string }[] = []
  const re = /:([a-zA-Z0-9_]+(?:@[\w.-]+)?):/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const name = match[1]!
    const url = resolveEmoji(name)
    if (!url) continue
    if (match.index > lastIndex) {
      customSegments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    customSegments.push({ type: 'emoji', value: match[0], url })
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) {
    customSegments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  // Pass 2: split remaining text segments for Unicode emoji → twemoji
  const result: typeof customSegments = []
  for (const seg of customSegments) {
    if (seg.type !== 'text') {
      result.push(seg)
      continue
    }
    for (const sub of splitTextWithEmoji(seg.value)) {
      result.push(sub)
    }
  }
  return result
})
</script>

<template>
  <div class="note-root" :class="{ detailed }" tabindex="0">
    <!-- Renote info bar -->
    <div v-if="isPureRenote" class="renote-info">
      <img
        v-if="note.user.avatarUrl"
        :src="note.user.avatarUrl"
        class="renote-avatar"
      />
      <span class="renote-user">{{ note.user.name || note.user.username }}</span>
      <span class="renote-label">Renoted</span>
      <span class="renote-time">{{ formatTime(note.createdAt) }}</span>
    </div>

    <article class="article" @click="navigateToDetail">
      <img
        v-if="effectiveNote.user.avatarUrl"
        :src="effectiveNote.user.avatarUrl!"
        :alt="effectiveNote.user.username ?? undefined"
        class="avatar"
      />
      <div v-else class="avatar avatar-placeholder" />

      <div class="main">
        <!-- Header -->
        <header class="header">
          <span class="name">{{ effectiveNote.user.name || effectiveNote.user.username }}</span>
          <span class="username">@{{ effectiveNote.user.username }}{{ effectiveNote.user.host ? `@${effectiveNote.user.host}` : '' }}</span>
          <span class="info">
            <span class="time">{{ formatTime(effectiveNote.createdAt) }}</span>
          </span>
        </header>

        <!-- CW -->
        <div v-if="effectiveNote.cw !== null" class="cw">
          <p class="cw-text">{{ effectiveNote.cw }}</p>
        </div>

        <!-- Body -->
        <div class="body">
          <p v-if="effectiveNote.text" class="text"><template v-for="(seg, i) in textSegments" :key="i"><img v-if="seg.type === 'emoji'" :src="seg.url" :alt="seg.value" class="custom-emoji" /><template v-else>{{ seg.value }}</template></template></p>

          <div v-if="effectiveNote.files.length > 0" class="files">
            <div
              v-for="file in effectiveNote.files"
              :key="file.id"
              class="file-preview"
            >
              <img
                v-if="file.type.startsWith('image/')"
                :src="file.thumbnailUrl || file.url"
                :alt="file.name"
                class="file-image"
                loading="lazy"
              />
            </div>
          </div>

          <!-- Quote renote (when note has text + renote) -->
          <div v-if="note.renote && note.text !== null" class="quote">
            <MkNote :note="note.renote" />
          </div>
        </div>

        <!-- Reactions -->
        <div
          v-if="Object.keys(effectiveNote.reactions).length > 0"
          class="reactions"
        >
          <button
            v-for="(count, reaction) in effectiveNote.reactions"
            :key="reaction"
            class="reaction"
            :class="{ reacted: effectiveNote.myReaction === reaction }"
            @click.stop="emit('react', String(reaction))"
          >
            <img v-if="reactionUrl(String(reaction))" :src="reactionUrl(String(reaction))!" :alt="String(reaction)" class="custom-emoji" />
            <MkEmoji v-else :emoji="String(reaction)" class="reaction-emoji" />
            <span class="count">{{ count }}</span>
          </button>
        </div>

        <!-- Footer -->
        <footer class="footer">
          <button class="footer-button" @click.stop="emit('reply', effectiveNote)">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path
                d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"
              />
            </svg>
            <span v-if="effectiveNote.repliesCount > 0" class="button-count">
              {{ effectiveNote.repliesCount }}
            </span>
          </button>
          <button class="footer-button renote-button" @click.stop="showRenoteMenu = !showRenoteMenu">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path
                d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"
                stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"
              />
            </svg>
            <span v-if="effectiveNote.renoteCount > 0" class="button-count">
              {{ effectiveNote.renoteCount }}
            </span>
          </button>
          <button
            class="footer-button"
            @click.stop="showReactionInput = !showReactionInput"
          >
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
            </svg>
          </button>
          <span class="server-badge">{{ note._serverHost }}</span>
        </footer>

        <!-- Renote menu -->
        <div v-if="showRenoteMenu" class="renote-menu">
          <button class="_button renote-menu-item" @click.stop="emit('renote', effectiveNote); showRenoteMenu = false">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"
                stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Renote
          </button>
          <button class="_button renote-menu-item" @click.stop="emit('quote', effectiveNote); showRenoteMenu = false">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Quote
          </button>
        </div>

        <!-- Reaction picker -->
        <div v-if="showReactionInput" class="reaction-picker">
          <button
            v-for="emoji in ['👍', '❤️', '😆', '🤔', '😮', '🎉', '💢', '😥', '🍮', '🤯']"
            :key="emoji"
            class="emoji-btn"
            @click.stop="emit('react', emoji); showReactionInput = false"
          >
            <MkEmoji :emoji="emoji" />
          </button>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.note-root {
  position: relative;
  font-size: 1.05em;
  contain: content;
  container-type: inline-size;
}

.note-root:not(.detailed) {
  cursor: pointer;
}

.note-root:not(.detailed):hover > .article {
  background: var(--nd-panelHighlight);
}

/* Renote info bar */
.renote-info {
  display: flex;
  padding: 16px 32px 8px 32px;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
  color: var(--nd-renote);
}

.renote-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.renote-user {
  font-weight: bold;
}

.renote-label {
  opacity: 0.7;
}

.renote-time {
  margin-left: auto;
  opacity: 0.6;
}

/* Main article layout */
.article {
  display: flex;
  padding: 28px 32px;
}

.avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  margin: 0 14px 0 0;
}

.avatar-placeholder {
  background: var(--nd-buttonBg);
}

.main {
  flex: 1;
  min-width: 0;
}

/* Header */
.header {
  display: flex;
  align-items: baseline;
  white-space: nowrap;
  margin-bottom: 4px;
}

.name {
  flex-shrink: 1;
  font-size: 1em;
  font-weight: bold;
  margin: 0 0.5em 0 0;
  text-overflow: ellipsis;
  overflow: hidden;
  color: var(--nd-fgHighlighted);
}

.username {
  flex-shrink: 9999999;
  margin: 0 0.5em 0 0;
  text-overflow: ellipsis;
  overflow: hidden;
  opacity: 0.7;
}

.info {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 0.9em;
}

.time {
  opacity: 0.7;
}

/* CW */
.cw-text {
  font-weight: bold;
  margin: 0;
}

/* Body */
.body {
  overflow-wrap: break-word;
}

.text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.files {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 6px;
  margin-top: 8px;
}

.file-image {
  width: 100%;
  border-radius: 8px;
  max-height: 250px;
  object-fit: cover;
}

/* Quote renote */
.quote {
  padding: 8px 0;
}

.quote > .note-root {
  padding: 16px;
  border: dashed 1px var(--nd-renote);
  border-radius: 8px;
}

/* Reactions */
.reactions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
}

.reaction {
  display: inline-flex;
  height: 42px;
  padding: 0 6px;
  font-size: 1.5em;
  border-radius: 6px;
  align-items: center;
  justify-content: center;
  background: var(--nd-buttonBg);
  border: none;
  cursor: pointer;
  color: var(--nd-fg);
  transition: background 0.15s;
}

.reaction:hover {
  background: rgba(0, 0, 0, 0.1);
}

.reaction.reacted,
.reaction.reacted:hover {
  background: var(--nd-accentedBg);
  color: var(--nd-accent);
  box-shadow: 0 0 0 1px var(--nd-accent) inset;
}

.custom-emoji {
  height: 2em;
  vertical-align: middle;
  object-fit: contain;
}

.reaction .custom-emoji {
  height: 1.25em;
}

.reaction-emoji :deep(.twemoji) {
  height: 1.25em;
}

.reaction .count {
  font-size: 0.7em;
  line-height: 42px;
  margin: 0 0 0 4px;
}

.reaction.reacted .count {
  color: var(--nd-accent);
}

/* Footer */
.footer {
  display: flex;
  align-items: center;
  margin-top: 4px;
  margin-bottom: -14px;
}

.footer-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  margin-right: 28px;
  border: none;
  background: none;
  cursor: pointer;
  color: color-mix(in srgb, var(--nd-panel) 30%, var(--nd-fg) 70%);
  font-size: 0.9em;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s;
}

.footer-button:hover {
  color: var(--nd-fgHighlighted);
  background: var(--nd-buttonHoverBg);
}

.renote-button:hover {
  color: var(--nd-renote);
}

.button-count {
  font-size: 0.85em;
}

.server-badge {
  margin-left: auto;
  opacity: 0.4;
  font-size: 0.75em;
}

/* Renote menu */
.renote-menu {
  display: flex;
  gap: 4px;
  padding: 6px 0;
}

.renote-menu-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 0.85em;
  font-weight: bold;
  border-radius: 6px;
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  transition: background 0.15s;
}

.renote-menu-item:hover {
  background: var(--nd-buttonHoverBg);
  color: var(--nd-renote);
}

/* Reaction picker */
.reaction-picker {
  display: flex;
  gap: 4px;
  padding: 8px 0;
  flex-wrap: wrap;
}

.emoji-btn {
  padding: 6px;
  border: none;
  border-radius: 6px;
  background: var(--nd-buttonBg);
  cursor: pointer;
  font-size: 1.25em;
  line-height: 1;
}

.emoji-btn:hover {
  background: var(--nd-buttonHoverBg);
}

/* Divider between notes */
.note-root + .note-root {
  border-top: 1px solid var(--nd-divider);
}

/* Container query responsive breakpoints */
@container (max-width: 580px) {
  .note-root { font-size: 0.95em; }
  .article { padding: 24px 26px; }
  .avatar { width: 50px; height: 50px; }
  .renote-info { padding: 12px 26px 6px 26px; }
}

@container (max-width: 500px) {
  .note-root { font-size: 0.9em; }
  .article { padding: 20px 22px; }
  .footer { margin-bottom: -8px; }
}

@container (max-width: 480px) {
  .article { padding: 14px 16px; }
  .renote-info { padding: 8px 16px 4px 16px; }
}

@container (max-width: 450px) {
  .avatar { width: 46px; height: 46px; margin: 0 10px 0 0; }
}

@container (max-width: 400px) {
  .footer-button { margin-right: 18px; }
}

@container (max-width: 350px) {
  .footer-button { margin-right: 12px; }
}

@container (max-width: 300px) {
  .footer-button { margin-right: 8px; }
  .reaction { height: 32px; font-size: 1em; border-radius: 4px; }
  .reaction .count { font-size: 0.9em; line-height: 32px; }
}
</style>
