<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, defineAsyncComponent, ref } from 'vue'
import type {
  NormalizedNote,
  NormalizedUser,
  NoteVisibility,
} from '@/adapters/types'
import { applyNoteViewInterruptors } from '@/aiscript/plugin-api'
import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { useHoverPopup } from '@/composables/useHoverPopup'
import { useNavigation } from '@/composables/useNavigation'
import { useAccountsStore } from '@/stores/accounts'
import { usePinnedReactionsStore } from '@/stores/pinnedReactions'
import { CUSTOM_TL_ICONS } from '@/utils/customTimelines'
import { formatTime } from '@/utils/formatTime'
import { proxyUrl } from '@/utils/imageProxy'
import MkAvatar from './MkAvatar.vue'
import MkEmoji from './MkEmoji.vue'
import MkMediaGrid from './MkMediaGrid.vue'
import MkMfm from './MkMfm.vue'
import MkPoll from './MkPoll.vue'
import NoteMoreMenu from './NoteMoreMenu.vue'
import NoteReactionPickerPopup from './NoteReactionPickerPopup.vue'
import NoteReactionUsersPopup from './NoteReactionUsersPopup.vue'

const MkUserPopup = defineAsyncComponent(() => import('./MkUserPopup.vue'))

const props = defineProps<{
  note: NormalizedNote
  detailed?: boolean
  focused?: boolean
  pinnedNoteIds?: string[]
  embedded?: boolean
}>()

/** Pure renote → show inner note, otherwise show note itself */
const effectiveNote = computed(() => {
  const base =
    props.note.renote && props.note.text === null
      ? props.note.renote
      : props.note
  return applyNoteViewInterruptors(base)
})
const allEmojis = computed(() => ({
  ...effectiveNote.value.emojis,
  ...effectiveNote.value.user.emojis,
}))
const isPureRenote = computed(
  () => props.note.renote && props.note.text === null,
)

const moreMenuRef = ref<InstanceType<typeof NoteMoreMenu> | null>(null)
const reactionPickerRef = ref<InstanceType<
  typeof NoteReactionPickerPopup
> | null>(null)
const reactionUsersRef = ref<InstanceType<
  typeof NoteReactionUsersPopup
> | null>(null)

const emit = defineEmits<{
  react: [reaction: string, note: NormalizedNote]
  reply: [note: NormalizedNote]
  renote: [note: NormalizedNote]
  quote: [note: NormalizedNote]
  delete: [note: NormalizedNote]
  edit: [note: NormalizedNote]
  bookmark: [note: NormalizedNote]
  pin: [note: NormalizedNote]
}>()

const { navigateToNote: navToNote, navigateToUser: navToUser } = useNavigation()
const accountsStore = useAccountsStore()
const pinnedReactionsStore = usePinnedReactionsStore()
const pinnedReactions = computed(() =>
  pinnedReactionsStore.get(props.note._accountId),
)
const { resolveEmoji: resolveEmojiRaw, reactionUrl: reactionUrlRaw } =
  useEmojiResolver()
const instanceIconUrl = computed(() => {
  const inst = effectiveNote.value.user.instance
  if (!inst) return null
  return inst.faviconUrl || inst.iconUrl || null
})

const instanceTickerStyle = computed(() => {
  const color = effectiveNote.value.user.instance?.themeColor || '#777'
  return {
    background: `linear-gradient(90deg, ${color}, transparent)`,
  }
})

const showRenoteMenu = ref(false)
const cwExpanded = ref(false)
const longTextExpanded = ref(false)

const LONG_TEXT_THRESHOLD = 500
const LONG_TEXT_LINES = 8
const isLongText = computed(() => {
  const text = effectiveNote.value.text
  if (!text || effectiveNote.value.cw !== null) return false
  if (text.length > LONG_TEXT_THRESHOLD) return true
  const lines = text.split('\n').length
  return lines > LONG_TEXT_LINES
})

const isOwnNote = computed(() => {
  const account = accountsStore.accountMap.get(props.note._accountId)
  return account?.userId === effectiveNote.value.user.id
})

// User hover popup
const userPopup = useHoverPopup()

function onAvatarMouseEnter(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  userPopup.show({ x: rect.right + 8, y: rect.top })
}

function onAvatarMouseLeave() {
  userPopup.hide()
}

function closeUserPopup() {
  userPopup.forceClose()
}

const VISIBILITY_ICONS: Record<NoteVisibility, string> = {
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

function navigateToDetail() {
  if (!props.detailed) {
    navToNote(props.note._accountId, props.note.id)
  }
}

function navigateToUser(userId: string, e: Event) {
  e.stopPropagation()
  navToUser(props.note._accountId, userId)
}

const reactionsData = computed(() => {
  const n = effectiveNote.value
  const entries = Object.entries(n.reactions)
  if (entries.length === 0)
    return {
      sorted: [] as { reaction: string; count: number }[],
      urls: {} as Record<string, string | null>,
    }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const sorted: { reaction: string; count: number }[] = []
  const urls: Record<string, string | null> = {}
  for (const [reaction, count] of entries) {
    sorted.push({ reaction, count: count as number })
    urls[reaction] = reactionUrlRaw(
      reaction,
      n.emojis,
      n.reactionEmojis,
      n._serverHost,
    )
  }
  return { sorted, urls }
})

const sortedReactions = computed(() => reactionsData.value.sorted)
const reactionUrls = computed(() => reactionsData.value.urls)

async function handleMentionClick(username: string, host: string | null) {
  try {
    const user = await invoke<NormalizedUser>('api_lookup_user', {
      accountId: props.note._accountId,
      username,
      host: host ?? null,
    })
    navToUser(props.note._accountId, user.id)
  } catch (e) {
    console.warn('[MkNote] failed to lookup user:', username, host, e)
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
  mentionHovering = true
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  try {
    const user = await invoke<NormalizedUser>('api_lookup_user', {
      accountId: props.note._accountId,
      username,
      host: host ?? null,
    })
    if (!mentionHovering) return
    mentionUserId.value = user.id
    mentionPopup.show({ x: rect.right + 8, y: rect.top })
  } catch {
    // lookup failed
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
  <div
    class="note-root"
    :class="{ detailed, focused }"
    tabindex="0"
  >
    <!-- Pinned indicator -->
    <div v-if="pinnedNoteIds?.includes(note.id)" class="pinned-info">
      <i class="ti ti-pin pinned-icon" />
      <span class="pinned-label">ピン留めされたノート</span>
    </div>

    <!-- Renote info bar -->
    <div v-if="isPureRenote" class="renote-info">
      <i class="ti ti-repeat renote-icon" />
      <img
        v-if="note.user.avatarUrl"
        :key="note.user.avatarUrl"
        :src="proxyUrl(note.user.avatarUrl)"
        class="renote-avatar"
        width="28"
        height="28"
        decoding="async"
      />
      <span class="renote-user">
        <MkMfm
          v-if="note.user.name"
          :text="note.user.name"
          :emojis="{ ...note.emojis, ...note.user.emojis }"
          :server-host="note._serverHost"
          :account-id="note._accountId"
        />
        <template v-else>{{ note.user.username }}</template>
      </span>
      <span class="renote-label">リノート</span>
      <span class="renote-time">{{ formatTime(note.createdAt) }}</span>
    </div>

    <!-- Reply-to preview (Misskey style) -->
    <div
      v-if="effectiveNote.reply && !embedded"
      class="reply-to"
      @click.stop="navToNote(note._accountId, effectiveNote.reply!.id)"
    >
      <img
        v-if="effectiveNote.reply!.user.avatarUrl"
        :src="proxyUrl(effectiveNote.reply!.user.avatarUrl)"
        class="reply-to-avatar"
        width="20"
        height="20"
        decoding="async"
      />
      <span class="reply-to-name">
        <MkMfm
          v-if="effectiveNote.reply!.user.name"
          :text="effectiveNote.reply!.user.name"
          :emojis="{ ...effectiveNote.reply!.emojis, ...effectiveNote.reply!.user.emojis }"
          :server-host="effectiveNote._serverHost"
          :account-id="note._accountId"
        />
        <template v-else>{{ effectiveNote.reply!.user.username }}</template>
      </span>
      <span class="reply-to-text">
        <MkMfm
          :text="effectiveNote.reply!.cw ?? effectiveNote.reply!.text?.slice(0, 100) ?? ''"
          :emojis="{ ...effectiveNote.reply!.emojis, ...effectiveNote.reply!.reactionEmojis }"
          :server-host="effectiveNote._serverHost"
          :account-id="note._accountId"
          compact
        />
      </span>
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
          <i v-if="effectiveNote.replyId" class="ti ti-arrow-back-up reply-icon" />
          <span class="name">
            <MkMfm
              v-if="effectiveNote.user.name"
              :text="effectiveNote.user.name"
              :emojis="allEmojis"
              :server-host="effectiveNote._serverHost"
              :account-id="effectiveNote._accountId"
              @mention-click="handleMentionClick"
              @mention-hover="onMentionHover"
              @mention-leave="onMentionLeave"
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
            <i
              v-if="effectiveNote.localOnly"
              class="ti ti-rocket-off visibility-icon"
              title="Local only"
            />
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

        <!-- Server badge (remote users) -->
        <div
          v-if="effectiveNote.user.instance"
          class="instance-ticker"
          :style="instanceTickerStyle"
        >
          <img
            v-if="instanceIconUrl"
            :src="proxyUrl(instanceIconUrl)"
            class="instance-icon"
            width="14"
            height="14"
            loading="lazy"
            decoding="async"
          />
          <span class="instance-name">{{ effectiveNote.user.instance.name || effectiveNote.user.host }}</span>
        </div>

        <!-- CW -->
        <div v-if="effectiveNote.cw !== null" class="cw">
          <p class="cw-text">
            <MkMfm
              v-if="effectiveNote.cw"
              :text="effectiveNote.cw"
              :emojis="effectiveNote.emojis"
              :server-host="effectiveNote._serverHost"
              :account-id="effectiveNote._accountId"
              @mention-click="handleMentionClick"
              @mention-hover="onMentionHover"
              @mention-leave="onMentionLeave"
            />
          </p>
          <button class="cw-toggle _button" @click.stop="cwExpanded = !cwExpanded">
            {{ cwExpanded ? '隠す' : 'もっと見る' }}
            <span v-if="!cwExpanded && effectiveNote.text" class="cw-chars">({{ effectiveNote.text.length }}文字)</span>
          </button>
        </div>

        <!-- Body -->
        <div v-show="effectiveNote.cw === null || cwExpanded" class="body">
          <div v-if="effectiveNote.text" class="text-container" :class="{ collapsed: isLongText && !longTextExpanded }">
            <p class="text">
              <MkMfm
                :text="effectiveNote.text"
                :emojis="effectiveNote.emojis"
                :reaction-emojis="effectiveNote.reactionEmojis"
                :server-host="effectiveNote._serverHost"
                :account-id="effectiveNote._accountId"
                @mention-click="handleMentionClick"
                @mention-hover="onMentionHover"
                @mention-leave="onMentionLeave"
              />
            </p>
            <div v-if="isLongText && !longTextExpanded" class="long-text-fade" />
          </div>
          <button v-if="isLongText" class="cw-toggle _button" @click.stop="longTextExpanded = !longTextExpanded">
            {{ longTextExpanded ? '隠す' : 'もっと見る' }}
            <span v-if="!longTextExpanded && effectiveNote.text" class="cw-chars">({{ effectiveNote.text.length }}文字)</span>
          </button>

          <MkMediaGrid
            v-if="effectiveNote.files.length > 0"
            :files="effectiveNote.files"
          />

          <MkPoll
            v-if="effectiveNote.poll"
            :poll="effectiveNote.poll"
          />

          <!-- Quote renote (when note has text + renote) -->
          <div v-if="note.renote && note.text !== null" class="quote" @click.stop>
            <MkNote :note="note.renote" embedded />
          </div>
        </div>

        <!-- Reactions -->
        <div
          v-if="sortedReactions.length > 0 && !embedded"
          class="reactions"
        >
          <button
            v-for="r in sortedReactions"
            :key="r.reaction"
            class="reaction"
            :class="{ reacted: effectiveNote.myReaction === r.reaction }"
            @click.stop="emit('react', r.reaction, effectiveNote)"
            @mouseenter="reactionUsersRef?.show($event, r.reaction, reactionUrls[r.reaction] ?? null, effectiveNote.reactions[r.reaction] ?? 0)"
            @mouseleave="reactionUsersRef?.hide()"
          >
            <img v-if="reactionUrls[r.reaction]" :src="proxyUrl(reactionUrls[r.reaction]!)" :alt="r.reaction" class="custom-emoji" decoding="async" loading="lazy" />
            <span v-else-if="r.reaction.startsWith(':')" class="reaction-emoji-fallback">{{ r.reaction }}</span>
            <MkEmoji v-else :emoji="r.reaction" class="reaction-emoji" />
            <span class="count">{{ r.count }}</span>
          </button>
        </div>

        <!-- Footer -->
        <footer v-if="!embedded" class="footer">
          <button class="footer-button reply-button" @click.stop="emit('reply', effectiveNote)">
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
            class="footer-button reaction-button"
            @click.stop="reactionPickerRef?.open($event)"
          >
            <i class="ti ti-plus" />
          </button>
          <button
            class="footer-button more-button"
            @click.stop="moreMenuRef?.open($event)"
          >
            <i class="ti ti-dots" />
          </button>
        </footer>

        <!-- Renote menu -->
        <div v-if="showRenoteMenu && !embedded" class="renote-menu">
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
      v-if="userPopup.isVisible.value"
      :user-id="effectiveNote.user.id"
      :account-id="note._accountId"
      :x="userPopup.position.value.x"
      :y="userPopup.position.value.y"
      @close="closeUserPopup"
    />
  </Teleport>

  <Teleport to="body">
    <MkUserPopup
      v-if="mentionPopup.isVisible.value && mentionUserId"
      :user-id="mentionUserId"
      :account-id="note._accountId"
      :x="mentionPopup.position.value.x"
      :y="mentionPopup.position.value.y"
      @close="closeMentionPopup"
    />
  </Teleport>

  <NoteReactionUsersPopup
    ref="reactionUsersRef"
    :note-id="effectiveNote.id"
    :account-id="note._accountId"
    :server-host="effectiveNote._serverHost"
  />

  <NoteMoreMenu
    ref="moreMenuRef"
    :note="effectiveNote"
    :is-own-note="isOwnNote"
    :is-favorited="effectiveNote.isFavorited ?? false"
    :is-pinned="props.pinnedNoteIds?.includes(effectiveNote.id) ?? false"
    @delete="emit('delete', $event)"
    @edit="emit('edit', $event)"
    @bookmark="emit('bookmark', $event)"
    @pin="emit('pin', $event)"
  />

  <NoteReactionPickerPopup
    ref="reactionPickerRef"
    :server-host="effectiveNote._serverHost"
    :pinned-emojis="pinnedReactions"
    @pick="(r: string) => emit('react', r, effectiveNote)"
  />
</template>

<style scoped>
.note-root {
  position: relative;
  font-size: 1em;
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

/* Pinned indicator */
.pinned-info {
  display: flex;
  padding: 12px 24px 0 24px;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  color: var(--nd-accent);
}

.pinned-icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.pinned-label {
  opacity: 0.8;
  font-weight: bold;
}

/* Reply-to preview */
.reply-to {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 24px 0 24px;
  cursor: pointer;
  overflow: hidden;
  opacity: 0.7;
  transition: opacity 0.15s;
}

.reply-to:hover {
  opacity: 1;
}

.reply-to-avatar {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.reply-to-name {
  flex-shrink: 0;
  font-size: 0.8em;
  font-weight: bold;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reply-to-name :deep(.custom-emoji) {
  height: 1em;
  width: auto;
}

.reply-to-text {
  flex: 1;
  font-size: 0.8em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
}

/* Reply icon in header */
.reply-icon {
  color: var(--nd-accent);
  margin-right: 0.5em;
  flex-shrink: 0;
}

/* Renote info bar */
.renote-info {
  display: flex;
  padding: 16px 24px 8px 24px;
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
  padding: 24px;
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

/* Server badge (instance ticker) */
.instance-ticker {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
  padding: 1px 8px;
  border-radius: 3px;
  font-size: 0.75em;
  line-height: 1.4;
  width: fit-content;
  overflow: hidden;
}

.instance-icon {
  flex-shrink: 0;
  border-radius: 2px;
  object-fit: contain;
}

.instance-name {
  color: #fff;
  font-weight: bold;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  max-width: 200px;
  -webkit-text-stroke: 0.5px rgba(0, 0, 0, 0.7);
  paint-order: stroke fill;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.7);
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
  font-size: 14px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
  padding: 4px 12px;
  min-height: 36px;
  border: none;
  border-radius: 999px;
  background: var(--nd-accentedBg);
  color: var(--nd-accent);
  font-size: 0.8em;
  font-weight: normal;
  cursor: pointer;
  transition: background 0.15s;
}

.cw-toggle:hover {
  background: var(--nd-buttonHoverBg);
}

.cw-chars {
  opacity: 0.7;
  font-weight: normal;
}

/* Body */
.body {
  overflow-wrap: break-word;
}

.text-container {
  position: relative;
}

.text-container.collapsed {
  max-height: 200px;
  overflow: hidden;
}

.long-text-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: linear-gradient(to bottom, transparent, var(--nd-panel));
  pointer-events: none;
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
  height: 44px;
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
  width: auto;
  vertical-align: middle;
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
  line-height: 44px;
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
  justify-content: center;
  gap: 4px;
  padding: 8px;
  min-height: 44px;
  min-width: 44px;
  margin-right: 28px;
  border: none;
  background: none;
  cursor: pointer;
  color: color-mix(in srgb, var(--nd-panel) 30%, var(--nd-fg) 70%);
  font-size: 1em;
  border-radius: 6px;
  transition: color 0.15s, background 0.15s, transform 0.1s;
}

.footer-button:active {
  transform: scale(0.9);
}

.footer-button:hover {
  background: var(--nd-buttonHoverBg);
}

.reply-button:hover {
  color: #3b97c4;
}

.renote-button:hover {
  color: var(--nd-renote);
}

.reaction-button:hover {
  color: #e5a400;
}

.more-button:hover {
  color: var(--nd-fgHighlighted);
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

/* Divider between notes */
.note-root + .note-root {
  border-top: 1px solid var(--nd-divider);
}

/* Container query responsive breakpoints */
@container (max-width: 580px) {
  .note-root { font-size: 0.95em; }
  .article { padding: 20px; }
  .renote-info { padding: 12px 20px 6px 20px; }
  .pinned-info { padding: 10px 20px 0 20px; }
  .reply-to { padding: 10px 20px 0 20px; }
}

@container (max-width: 500px) {
  .note-root { font-size: 0.9em; }
  .article { padding: 16px; }
  .renote-info { padding: 8px 16px 4px 16px; }
  .pinned-info { padding: 8px 16px 0 16px; }
  .reply-to { padding: 8px 16px 0 16px; }
  .footer { margin-bottom: -4px; }
  .footer-button { margin-right: 12px; }
  .instance-name { max-width: 120px; }
}

@container (max-width: 450px) {
  .avatar { margin: 0 10px 0 0; }
}

@container (max-width: 350px) {
  .article { padding: 12px 14px; }
  .footer-button { margin-right: 8px; }
  .reply-to { padding: 6px 14px 0 14px; }
}

@container (max-width: 300px) {
  .reaction { height: 36px; font-size: 1em; border-radius: 4px; }
  .reaction .count { font-size: 0.9em; line-height: 36px; }
}
</style>
