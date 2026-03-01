<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { NormalizedNote, NormalizedUser } from '@/adapters/types'
import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { proxyUrl } from '@/composables/useImageProxy'
import { useAccountsStore } from '@/stores/accounts'
import { CUSTOM_TL_ICONS } from '@/utils/customTimelines'
import { formatTime } from '@/utils/formatTime'
import { isSafeUrl } from '@/utils/url'
import MkAvatar from './MkAvatar.vue'
import MkEmoji from './MkEmoji.vue'
import MkMediaGrid from './MkMediaGrid.vue'
import MkMfm from './MkMfm.vue'
import MkPoll from './MkPoll.vue'

const MkReactionPicker = defineAsyncComponent(
  () => import('./MkReactionPicker.vue'),
)
const MkUserPopup = defineAsyncComponent(() => import('./MkUserPopup.vue'))
const MkReactionUsersPopup = defineAsyncComponent(
  () => import('./MkReactionUsersPopup.vue'),
)

const props = defineProps<{
  note: NormalizedNote
  detailed?: boolean
  focused?: boolean
}>()

/** Pure renote → show inner note, otherwise show note itself */
const effectiveNote = computed(() =>
  props.note.renote && props.note.text === null
    ? props.note.renote
    : props.note,
)
const isPureRenote = computed(
  () => props.note.renote && props.note.text === null,
)

// Track isFavorited locally: shallowRef arrays don't propagate deep property changes
const localIsFavorited = ref(effectiveNote.value.isFavorited ?? false)
watch(
  () => effectiveNote.value.isFavorited,
  (v) => {
    localIsFavorited.value = v ?? false
  },
)

const emit = defineEmits<{
  react: [reaction: string, note: NormalizedNote]
  reply: [note: NormalizedNote]
  renote: [note: NormalizedNote]
  quote: [note: NormalizedNote]
  delete: [note: NormalizedNote]
  edit: [note: NormalizedNote]
  bookmark: [note: NormalizedNote]
}>()

const router = useRouter()
const accountsStore = useAccountsStore()
const { resolveEmoji: resolveEmojiRaw, reactionUrl: reactionUrlRaw } =
  useEmojiResolver()
const showReactionInput = ref(false)
const reactionPickerPos = ref({ x: 0, y: 0 })
const reactionPickerTheme = ref<Record<string, string>>({})

function openReactionPicker(e: MouseEvent) {
  const btn = e.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  const column = btn.closest('.deck-column') as HTMLElement | null
  const colRect = column?.getBoundingClientRect()
  const rightEdge = colRect ? colRect.right - 8 : rect.right
  reactionPickerPos.value = {
    x: rightEdge,
    y: rect.bottom + 4,
  }
  // Copy theme CSS vars from column for Teleport
  if (column) {
    const vars: Record<string, string> = {}
    for (const attr of column.style) {
      if (attr.startsWith('--nd-')) {
        vars[attr] = column.style.getPropertyValue(attr)
      }
    }
    reactionPickerTheme.value = vars
  }
  showReactionInput.value = !showReactionInput.value
}
const showRenoteMenu = ref(false)
const showMoreMenu = ref(false)
const showDeleteConfirm = ref(false)
const cwExpanded = ref(false)
const moreMenuPos = ref({ x: 0, y: 0 })

function openMoreMenu(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  moreMenuPos.value = {
    x: rect.left,
    y: rect.bottom + 4,
  }
  showMoreMenu.value = true
}

function closeMoreMenu() {
  showMoreMenu.value = false
  showDeleteConfirm.value = false
}

const isOwnNote = computed(() => {
  const account = accountsStore.accounts.find(
    (a) => a.id === props.note._accountId,
  )
  return account?.userId === effectiveNote.value.user.id
})

// User hover popup
const showUserPopup = ref(false)
const userPopupPos = ref({ x: 0, y: 0 })
let hoverTimer: ReturnType<typeof setTimeout> | null = null

function onAvatarMouseEnter(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  userPopupPos.value = { x: rect.right + 8, y: rect.top }
  hoverTimer = setTimeout(() => {
    showUserPopup.value = true
  }, 400)
}

function onAvatarMouseLeave() {
  if (hoverTimer) {
    clearTimeout(hoverTimer)
    hoverTimer = null
  }
}

function closeUserPopup() {
  showUserPopup.value = false
}

// Reaction users hover popup
const showReactionUsers = ref(false)
const reactionUsersPos = ref({ x: 0, y: 0 })
const reactionUsersReaction = ref('')
const reactionUsersReactionUrl = ref<string | null>(null)
const reactionUsersTotalCount = ref(0)
const reactionUsersTheme = ref<Record<string, string>>({})
let reactionHoverTimer: ReturnType<typeof setTimeout> | null = null
let reactionCloseTimer: ReturnType<typeof setTimeout> | null = null

function cancelReactionClose() {
  if (reactionCloseTimer) {
    clearTimeout(reactionCloseTimer)
    reactionCloseTimer = null
  }
}

function onReactionMouseEnter(e: MouseEvent, reaction: string) {
  if (reactionHoverTimer) {
    clearTimeout(reactionHoverTimer)
    reactionHoverTimer = null
  }
  cancelReactionClose()

  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  reactionUsersPos.value = { x: rect.left, y: rect.bottom + 4 }
  reactionUsersReaction.value = reaction
  reactionUsersReactionUrl.value = reactionUrls.value[reaction] ?? null
  reactionUsersTotalCount.value = effectiveNote.value.reactions[reaction] ?? 0

  const column = el.closest('.deck-column') as HTMLElement | null
  if (column) {
    const vars: Record<string, string> = {}
    for (const attr of column.style) {
      if (attr.startsWith('--nd-')) {
        vars[attr] = column.style.getPropertyValue(attr)
      }
    }
    reactionUsersTheme.value = vars
  }

  // Already showing for a different reaction → props update triggers re-fetch
  if (showReactionUsers.value) return

  reactionHoverTimer = setTimeout(() => {
    showReactionUsers.value = true
  }, 400)
}

function onReactionMouseLeave() {
  if (reactionHoverTimer) {
    clearTimeout(reactionHoverTimer)
    reactionHoverTimer = null
  }
  if (showReactionUsers.value) {
    cancelReactionClose()
    reactionCloseTimer = setTimeout(() => {
      // Don't close if mouse is currently over the popup
      const popup = document.querySelector('.reaction-users-popup')
      if (popup?.matches(':hover')) return
      showReactionUsers.value = false
    }, 300)
  }
}

function closeReactionUsers() {
  cancelReactionClose()
  showReactionUsers.value = false
}

onUnmounted(() => {
  if (hoverTimer) clearTimeout(hoverTimer)
  if (reactionHoverTimer) clearTimeout(reactionHoverTimer)
  if (reactionCloseTimer) clearTimeout(reactionCloseTimer)
})

const VISIBILITY_ICONS: Record<string, string> = {
  public:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  followers:
    'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  specified:
    'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
}

const DEFAULT_MODE_ICON = 'M12 2a10 10 0 100 20 10 10 0 000-20z'

const activeModeFlags = computed(() => {
  const flags = effectiveNote.value.modeFlags
  if (!flags) return []
  return Object.entries(flags)
    .filter(([, v]) => v)
    .map(([key]) => {
      const match = key.match(/^isNoteIn(.+)Mode$/)
      const label = match?.[1] ?? key
      return {
        key,
        label,
        icon: CUSTOM_TL_ICONS[label.toLowerCase()] ?? DEFAULT_MODE_ICON,
      }
    })
})

const noteWebUrl = computed(() => {
  const n = effectiveNote.value
  return n.url ?? n.uri ?? `https://${n._serverHost}/notes/${n.id}`
})

function openInWebUI() {
  const url = noteWebUrl.value
  if (url && isSafeUrl(url)) openUrl(url)
}

function navigateToDetail() {
  if (!props.detailed) {
    router.push(`/note/${props.note._accountId}/${props.note.id}`)
  }
}

function navigateToUser(userId: string, e: Event) {
  e.stopPropagation()
  router.push(`/user/${props.note._accountId}/${userId}`)
}

const sortedReactions = computed(() => {
  const n = effectiveNote.value
  return Object.entries(n.reactions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reaction, count]) => ({ reaction, count: count as number }))
})

const reactionUrls = computed(() => {
  const n = effectiveNote.value
  const urls: Record<string, string | null> = {}
  for (const { reaction } of sortedReactions.value) {
    urls[reaction] = reactionUrlRaw(
      reaction,
      n.emojis,
      n.reactionEmojis,
      n._serverHost,
    )
  }
  return urls
})

async function handleMentionClick(username: string, host: string | null) {
  try {
    const user = await invoke<NormalizedUser>('api_lookup_user', {
      accountId: props.note._accountId,
      username,
      host: host ?? null,
    })
    router.push(`/user/${props.note._accountId}/${user.id}`)
  } catch (e) {
    console.warn('[MkNote] failed to lookup user:', username, host, e)
  }
}
</script>

<template>
  <div class="note-root" :class="{ detailed, focused }" tabindex="0">
    <!-- Renote info bar -->
    <div v-if="isPureRenote" class="renote-info">
      <i class="ti ti-repeat renote-icon" />
      <img
        v-if="note.user.avatarUrl"
        :src="proxyUrl(note.user.avatarUrl)"
        class="renote-avatar"
        width="28"
        height="28"
        loading="lazy"
        decoding="async"
      />
      <span class="renote-user">
        <MkMfm
          v-if="note.user.name"
          :text="note.user.name"
          :emojis="{ ...note.emojis, ...note.user.emojis }"
          :server-host="note._serverHost"
        />
        <template v-else>{{ note.user.username }}</template>
      </span>
      <span class="renote-label">Renoted</span>
      <span class="renote-time">{{ formatTime(note.createdAt) }}</span>
    </div>

    <article class="article" @click="navigateToDetail">
      <MkAvatar
        :avatar-url="effectiveNote.user.avatarUrl"
        :decorations="effectiveNote.user.avatarDecorations"
        :size="46"
        :alt="effectiveNote.user.username ?? undefined"
        class="avatar"
        @click="navigateToUser(effectiveNote.user.id, $event)"
        @mouseenter="onAvatarMouseEnter"
        @mouseleave="onAvatarMouseLeave"
      />

      <div class="main">
        <!-- Header -->
        <header class="header">
          <span class="name">
            <MkMfm
              v-if="effectiveNote.user.name"
              :text="effectiveNote.user.name"
              :emojis="{ ...effectiveNote.emojis, ...effectiveNote.user.emojis }"
              :server-host="effectiveNote._serverHost"
              @mention-click="handleMentionClick"
            />
            <template v-else>{{ effectiveNote.user.username }}</template>
          </span>
          <span class="username">@{{ effectiveNote.user.username }}@{{ effectiveNote.user.host || note._serverHost }}</span>
          <span class="info">
            <span class="time">{{ formatTime(effectiveNote.createdAt) }}</span>
            <span
              v-if="effectiveNote.updatedAt"
              class="edited"
              :title="formatTime(effectiveNote.updatedAt)"
            >(edited)</span>
            <svg
              v-for="mode in activeModeFlags"
              :key="mode.key"
              class="visibility-icon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              :title="mode.label + ' Mode'"
            >
              <path :d="mode.icon" fill="currentColor" />
            </svg>
            <svg
              v-if="effectiveNote.localOnly"
              class="visibility-icon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
              title="Local only"
            >
              <path d="M4 13a8 8 0 0 1 7-7 4 4 0 0 0 6.243 6.243 8 8 0 0 1-7 7" />
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
              <path d="M15 9h.01" />
              <path d="M3 3l18 18" />
            </svg>
            <svg
              v-if="effectiveNote.visibility !== 'public'"
              class="visibility-icon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
            >
              <path :d="VISIBILITY_ICONS[effectiveNote.visibility] || VISIBILITY_ICONS.public" fill="currentColor" />
            </svg>
          </span>
        </header>

        <!-- CW -->
        <div v-if="effectiveNote.cw !== null" class="cw">
          <p class="cw-text">
            <MkMfm
              v-if="effectiveNote.cw"
              :text="effectiveNote.cw"
              :tokens="effectiveNote._parsedCw"
              :emojis="effectiveNote.emojis"
              :server-host="effectiveNote._serverHost"
              @mention-click="handleMentionClick"
            />
          </p>
          <button class="cw-toggle _button" @click.stop="cwExpanded = !cwExpanded">
            {{ cwExpanded ? 'Hide' : 'Show more' }}
          </button>
        </div>

        <!-- Body -->
        <div v-show="effectiveNote.cw === null || cwExpanded" class="body">
          <p v-if="effectiveNote.text" class="text">
            <MkMfm
              :text="effectiveNote.text"
              :tokens="effectiveNote._parsedText"
              :emojis="effectiveNote.emojis"
              :reaction-emojis="effectiveNote.reactionEmojis"
              :server-host="effectiveNote._serverHost"
              @mention-click="handleMentionClick"
            />
          </p>

          <MkMediaGrid
            v-if="effectiveNote.files.length > 0"
            :files="effectiveNote.files"
          />

          <MkPoll
            v-if="effectiveNote.poll"
            :poll="effectiveNote.poll"
          />

          <!-- Quote renote (when note has text + renote) -->
          <div v-if="note.renote && note.text !== null" class="quote">
            <MkNote :note="note.renote" />
          </div>
        </div>

        <!-- Reactions -->
        <div
          v-if="sortedReactions.length > 0"
          class="reactions"
        >
          <button
            v-for="r in sortedReactions"
            :key="r.reaction"
            class="reaction"
            :class="{ reacted: effectiveNote.myReaction === r.reaction }"
            @click.stop="emit('react', r.reaction, effectiveNote)"
            @mouseenter="onReactionMouseEnter($event, r.reaction)"
            @mouseleave="onReactionMouseLeave"
          >
            <img v-if="reactionUrls[r.reaction]" :src="proxyUrl(reactionUrls[r.reaction]!)" :alt="r.reaction" class="custom-emoji" width="20" height="20" />
            <span v-else-if="r.reaction.startsWith(':')" class="reaction-emoji-fallback">{{ r.reaction }}</span>
            <MkEmoji v-else :emoji="r.reaction" class="reaction-emoji" />
            <span class="count">{{ r.count }}</span>
          </button>
        </div>

        <!-- Footer -->
        <footer class="footer">
          <button class="footer-button" @click.stop="emit('reply', effectiveNote)">
            <i class="ti ti-arrow-back-up" />
            <span v-if="effectiveNote.repliesCount > 0" class="button-count">
              {{ effectiveNote.repliesCount }}
            </span>
          </button>
          <button class="footer-button renote-button" @click.stop="showRenoteMenu = !showRenoteMenu">
            <i class="ti ti-repeat" />
            <span v-if="effectiveNote.renoteCount > 0" class="button-count">
              {{ effectiveNote.renoteCount }}
            </span>
          </button>
          <button
            class="footer-button reaction-trigger"
            :class="{ active: showReactionInput }"
            @click.stop="openReactionPicker($event)"
          >
            <i class="ti ti-mood-plus" />
          </button>
          <button
            class="footer-button more-button"
            :class="{ active: showMoreMenu }"
            @click.stop="openMoreMenu($event)"
          >
            <i class="ti ti-dots" />
          </button>
        </footer>

        <!-- Renote menu -->
        <div v-if="showRenoteMenu" class="renote-menu">
          <button class="_button renote-menu-item" @click.stop="emit('renote', effectiveNote); showRenoteMenu = false">
            <i class="ti ti-repeat" />
            Renote
          </button>
          <button class="_button renote-menu-item" @click.stop="emit('quote', effectiveNote); showRenoteMenu = false">
            <i class="ti ti-quote" />
            Quote
          </button>
        </div>

      </div>
    </article>
  </div>

  <Teleport to="body">
    <MkUserPopup
      v-if="showUserPopup"
      :user-id="effectiveNote.user.id"
      :account-id="note._accountId"
      :x="userPopupPos.x"
      :y="userPopupPos.y"
      @close="closeUserPopup"
    />
  </Teleport>

  <Teleport to="body">
    <div
      v-if="showReactionUsers"
      :style="reactionUsersTheme"
    >
      <MkReactionUsersPopup
        :note-id="effectiveNote.id"
        :account-id="note._accountId"
        :server-host="effectiveNote._serverHost"
        :reaction="reactionUsersReaction"
        :reaction-url="reactionUsersReactionUrl"
        :total-count="reactionUsersTotalCount"
        :x="reactionUsersPos.x"
        :y="reactionUsersPos.y"
        @close="closeReactionUsers"
      />
    </div>
  </Teleport>

  <!-- More menu popup -->
  <Teleport to="body">
    <Transition name="nd-popup">
      <div v-if="showMoreMenu" class="popup-backdrop" @click="closeMoreMenu">
        <div
          class="popup-menu"
          :style="{ top: moreMenuPos.y + 'px', left: moreMenuPos.x + 'px' }"
          @click.stop
        >
          <!-- Delete confirmation mode -->
          <template v-if="showDeleteConfirm">
            <div class="popup-confirm-text">Delete this note?</div>
            <button class="popup-item popup-item-danger" @click="emit('delete', effectiveNote); closeMoreMenu()">
              <i class="ti ti-trash" />
              Delete
            </button>
            <button class="popup-item" @click="showDeleteConfirm = false">
              <i class="ti ti-x" />
              Cancel
            </button>
          </template>

          <!-- Normal menu -->
          <template v-else>
            <button
              class="popup-item"
              :class="{ 'popup-item-active': localIsFavorited }"
              @click="localIsFavorited = !localIsFavorited; emit('bookmark', effectiveNote); closeMoreMenu()"
            >
              <i :class="localIsFavorited ? 'ti ti-star-filled' : 'ti ti-star'" />
              {{ localIsFavorited ? 'お気に入り解除' : 'お気に入り' }}
            </button>
            <button class="popup-item" @click="openInWebUI(); closeMoreMenu()">
              <i class="ti ti-external-link" />
              Web UIで開く
            </button>
            <template v-if="isOwnNote">
              <div class="popup-divider" />
              <button class="popup-item" @click="emit('edit', effectiveNote); closeMoreMenu()">
                <i class="ti ti-edit" />
                Edit
              </button>
              <button class="popup-item popup-item-danger" @click="showDeleteConfirm = true">
                <i class="ti ti-trash" />
                Delete
              </button>
            </template>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Reaction picker popup -->
  <Teleport to="body">
    <Transition name="nd-popup">
      <div v-if="showReactionInput" class="popup-backdrop" @click="showReactionInput = false">
        <div
          class="reaction-picker-popup"
          :style="{ ...reactionPickerTheme, top: reactionPickerPos.y + 'px', left: reactionPickerPos.x + 'px' }"
          @click.stop
        >
          <MkReactionPicker
            :server-host="effectiveNote._serverHost"
            @pick="(r: string) => { emit('react', r, effectiveNote); showReactionInput = false }"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
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

.note-root:not(.detailed) > .article {
  transition: background 0.2s ease;
}

.note-root:not(.detailed):hover > .article {
  background: var(--nd-panelHighlight);
}

.note-root.focused {
  box-shadow: inset 3px 0 0 var(--nd-accent);
}

.note-root.focused > .article {
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

.renote-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.renote-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.renote-user {
  font-weight: bold;
}

.renote-user :deep(.custom-emoji) {
  height: 1.2em;
  width: auto;
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
  margin: 0 14px 0 0;
  cursor: pointer;
  transition: opacity 0.15s;
}

.avatar:hover {
  opacity: 0.8;
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

.name :deep(.mfm) {
  white-space: nowrap;
}

.name :deep(.custom-emoji) {
  height: 1.2em;
  width: auto;
}

.username {
  flex-shrink: 9999999;
  margin: 0 0.5em 0 0;
  text-overflow: ellipsis;
  overflow: hidden;
  opacity: 0.7;
}

.info {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
  font-size: 0.9em;
}

.edited {
  opacity: 0.5;
  font-size: 0.85em;
}

.time {
  opacity: 0.7;
}

.visibility-icon {
  opacity: 0.5;
}

/* CW */
.cw {
  margin-bottom: 4px;
}

.cw-text {
  font-weight: bold;
  margin: 0;
}

.cw-toggle {
  display: inline-block;
  margin-top: 4px;
  padding: 4px 12px;
  border: none;
  border-radius: 999px;
  background: var(--nd-accentedBg);
  color: var(--nd-accent);
  font-size: 0.8em;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.15s;
}

.cw-toggle:hover {
  background: var(--nd-buttonHoverBg);
}

/* Body */
.body {
  overflow-wrap: break-word;
}

.text {
  margin: 0;
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
  transition:
    background 0.15s,
    opacity 0.2s cubic-bezier(0, 0.5, 0.5, 1),
    transform 0.2s cubic-bezier(0, 0.5, 0.5, 1);
}

.reaction:hover {
  background: rgba(0, 0, 0, 0.1);
}

.reaction:active {
  animation: reaction-bounce 0.3s ease;
}

@keyframes reaction-bounce {
  0% { transform: scale(1); }
  40% { transform: scale(1.1); }
  100% { transform: scale(1); }
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

.reaction-emoji-fallback {
  font-size: 0.85em;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 5em;
  white-space: nowrap;
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
  transition: color 0.15s, background 0.15s, transform 0.1s;
}

.footer-button:active {
  transform: scale(0.9);
}

.footer-button:hover {
  color: var(--nd-fgHighlighted);
  background: var(--nd-buttonHoverBg);
}

.renote-button:hover {
  color: var(--nd-renote);
}

.reaction-trigger.active {
  color: var(--nd-accent);
}

.button-count {
  font-size: 0.85em;
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

/* Popup menu (Teleported to body) */
.popup-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: transparent;
}

.popup-menu {
  position: fixed;
  min-width: 200px;
  max-width: 300px;
  padding: 6px;
  background: color-mix(in srgb, var(--nd-popup, var(--nd-panel)) 85%, transparent);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(16px);
  z-index: 10001;
}

.popup-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  color: var(--nd-fg);
  font-size: 0.9em;
  text-align: left;
  transition: background 0.15s;
}

.popup-item:hover {
  background: var(--nd-buttonHoverBg);
}

.popup-item .ti {
  opacity: 0.7;
  flex-shrink: 0;
}

.popup-item-active {
  color: var(--nd-warn, #f0a020);
}

.popup-item-active .ti {
  opacity: 1;
}

.popup-item-danger {
  color: #ff2a2a;
}

.popup-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--nd-divider);
}

.popup-confirm-text {
  padding: 9px 12px;
  font-size: 0.9em;
  font-weight: bold;
  color: var(--nd-fg);
}

/* Popup transition */
.nd-popup-enter-active,
.nd-popup-leave-active {
  transition: opacity 0.15s ease;
}

.nd-popup-enter-active .popup-menu,
.nd-popup-leave-active .popup-menu,
.nd-popup-enter-active .reaction-picker-popup,
.nd-popup-leave-active .reaction-picker-popup {
  transition: opacity 0.2s cubic-bezier(0, 0, 0.2, 1), transform 0.2s cubic-bezier(0, 0, 0.2, 1);
}

.nd-popup-enter-from,
.nd-popup-leave-to {
  opacity: 0;
}

.nd-popup-enter-from .popup-menu,
.nd-popup-leave-to .popup-menu {
  transform: scale(0.95) translateY(-4px);
}

.nd-popup-enter-from .reaction-picker-popup,
.nd-popup-leave-to .reaction-picker-popup {
  transform: translateX(-100%) scale(0.95);
}

/* Reaction picker popup */
.reaction-picker-popup {
  position: fixed;
  transform: translateX(-100%);
  z-index: 10001;
}

/* Divider between notes */
.note-root + .note-root {
  border-top: 1px solid var(--nd-divider);
}

/* Container query responsive breakpoints */
@container (max-width: 580px) {
  .note-root { font-size: 0.95em; }
  .article { padding: 24px 26px; }
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
  .avatar { margin: 0 10px 0 0; }
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
