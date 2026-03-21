<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { useIntersectionObserver } from '@vueuse/core'
import { computed, defineAsyncComponent, ref } from 'vue'
import type {
  NormalizedNote,
  NormalizedUser,
  NoteVisibility,
} from '@/adapters/types'
import { applyNoteViewInterruptors } from '@/aiscript/plugin-api'
import { useAccountMode } from '@/composables/useAccountMode'
import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { useHoverPopup } from '@/composables/useHoverPopup'
import { useNavigation } from '@/composables/useNavigation'
import { useAccountsStore } from '@/stores/accounts'
import { CUSTOM_TL_ICONS } from '@/utils/customTimelines'
import { formatTime } from '@/utils/formatTime'
import { proxyThumbUrl, proxyUrl } from '@/utils/imageProxy'
import { extractThemeVars } from '@/utils/themeVars'
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

const { canInteract } = useAccountMode(() => props.note._accountId)

const moreMenuRef = ref<InstanceType<typeof NoteMoreMenu> | null>(null)
const reactionPickerRef = ref<InstanceType<
  typeof NoteReactionPickerPopup
> | null>(null)
const reactionUsersRef = ref<InstanceType<
  typeof NoteReactionUsersPopup
> | null>(null)
const reactionsAreaRef = ref<HTMLElement | null>(null)
const reactionsVisible = ref(false)

const { stop: stopReactionsObserver } = useIntersectionObserver(
  reactionsAreaRef,
  ([entry]) => {
    if (entry?.isIntersecting) {
      reactionsVisible.value = true
      stopReactionsObserver()
    }
  },
  { rootMargin: '200px' },
)

const emit = defineEmits<{
  react: [reaction: string, note: NormalizedNote]
  reply: [note: NormalizedNote]
  renote: [note: NormalizedNote]
  quote: [note: NormalizedNote]
  delete: [note: NormalizedNote]
  edit: [note: NormalizedNote]
  bookmark: [note: NormalizedNote]
  pin: [note: NormalizedNote]
  deleteAndEdit: [note: NormalizedNote]
}>()

const { navigateToNote: navToNote, navigateToUser: navToUser } = useNavigation()
const accountsStore = useAccountsStore()
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

const renoteMenuPos = ref<{ x: number; y: number } | null>(null)
const renoteMenuTheme = ref<Record<string, string>>({})
const myRenoteId = ref<string | null>(null)
const isRenoted = ref(false)

function openRenoteMenu(e: MouseEvent) {
  if (renoteMenuPos.value) {
    renoteMenuPos.value = null
    return
  }
  const el = e.currentTarget as HTMLElement
  const column = el.closest('.deck-column') as HTMLElement | null
  if (column) renoteMenuTheme.value = extractThemeVars(column)
  const rect = el.getBoundingClientRect()
  let x = rect.left
  let y = rect.bottom + 4
  const menuWidth = 200
  const menuHeight = 80
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  if (x + menuWidth > vw) x = vw - menuWidth - 8
  if (y + menuHeight > vh) y = Math.max(8, rect.top - menuHeight - 4)
  x = Math.max(8, x)
  y = Math.max(8, y)
  renoteMenuPos.value = { x, y }

  // Check if already renoted
  myRenoteId.value = null
  invoke<NormalizedNote[]>('api_get_note_renotes', {
    accountId: props.note._accountId,
    noteId: effectiveNote.value.id,
    limit: 30,
  })
    .then((renotes) => {
      const account = accountsStore.accountMap.get(props.note._accountId)
      const mine = renotes.find((r) => r.user.id === account?.userId)
      myRenoteId.value = mine?.id ?? null
      isRenoted.value = !!mine
    })
    .catch(() => {})
}

function closeRenoteMenu() {
  renoteMenuPos.value = null
}

async function handleUnrenote() {
  if (!myRenoteId.value) return
  const renoteId = myRenoteId.value
  closeRenoteMenu()
  effectiveNote.value.renoteCount = Math.max(
    0,
    (effectiveNote.value.renoteCount ?? 1) - 1,
  )
  isRenoted.value = false
  myRenoteId.value = null
  try {
    await invoke('api_delete_note', {
      accountId: props.note._accountId,
      noteId: renoteId,
    })
  } catch {
    effectiveNote.value.renoteCount = (effectiveNote.value.renoteCount ?? 0) + 1
    isRenoted.value = true
  }
}
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
const popupTheme = ref<Record<string, string>>({})

function onAvatarMouseEnter(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const column = el.closest('.deck-column') as HTMLElement | null
  if (column) popupTheme.value = extractThemeVars(column)
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
  const reactions = n.reactions
  const keys = Object.keys(reactions)
  if (keys.length === 0)
    return {
      sorted: [] as { reaction: string; count: number }[],
      urls: {} as Record<string, string | null>,
    }
  keys.sort()
  const sorted: { reaction: string; count: number }[] = new Array(keys.length)
  const urls: Record<string, string | null> = {}
  for (let i = 0; i < keys.length; i++) {
    const reaction = keys[i] as string
    sorted[i] = { reaction, count: reactions[reaction] as number }
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
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const column = el.closest('.deck-column') as HTMLElement | null
  if (column) popupTheme.value = extractThemeVars(column)
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
    :class="[$style.noteRoot, { [$style.detailed]: detailed, [$style.focused]: focused }]"
    tabindex="0"
    @contextmenu.prevent.stop="moreMenuRef?.open($event)"
  >
    <!-- Pinned indicator -->
    <div v-if="pinnedNoteIds?.includes(note.id)" :class="$style.pinnedInfo">
      <i class="ti ti-pin" :class="$style.pinnedIcon" />
      <span :class="$style.pinnedLabel">ピン留めされたノート</span>
    </div>

    <!-- Renote info bar -->
    <div v-if="isPureRenote" :class="$style.renoteInfo">
      <i class="ti ti-repeat" :class="$style.renoteIcon" />
      <img
        v-if="note.user.avatarUrl"
        :key="note.user.avatarUrl"
        :src="proxyThumbUrl(note.user.avatarUrl, 56)"
        :class="$style.renoteAvatar"
        width="28"
        height="28"
        decoding="async"
      />
      <span :class="$style.renoteUser">
        <MkMfm
          v-if="note.user.name"
          :text="note.user.name"
          :emojis="{ ...note.emojis, ...note.user.emojis }"
          :server-host="note._serverHost"
          :account-id="note._accountId"
        />
        <template v-else>{{ note.user.username }}</template>
      </span>
      <span :class="$style.renoteLabel">リノート</span>
      <span :class="$style.renoteTime">{{ formatTime(note.createdAt) }}</span>
    </div>

    <!-- Reply-to preview (Misskey style) -->
    <div
      v-if="effectiveNote.reply && !embedded"
      :class="$style.replyTo"
      @click.stop="navToNote(note._accountId, effectiveNote.reply!.id)"
    >
      <img
        v-if="effectiveNote.reply!.user.avatarUrl"
        :src="proxyUrl(effectiveNote.reply!.user.avatarUrl)"
        :class="$style.replyToAvatar"
        width="20"
        height="20"
        decoding="async"
      />
      <span :class="$style.replyToName">
        <MkMfm
          v-if="effectiveNote.reply!.user.name"
          :text="effectiveNote.reply!.user.name"
          :emojis="{ ...effectiveNote.reply!.emojis, ...effectiveNote.reply!.user.emojis }"
          :server-host="effectiveNote._serverHost"
          :account-id="note._accountId"
        />
        <template v-else>{{ effectiveNote.reply!.user.username }}</template>
      </span>
      <span :class="$style.replyToText">
        <MkMfm
          :text="effectiveNote.reply!.cw ?? effectiveNote.reply!.text?.slice(0, 100) ?? ''"
          :emojis="{ ...effectiveNote.reply!.emojis, ...effectiveNote.reply!.reactionEmojis }"
          :server-host="effectiveNote._serverHost"
          :account-id="note._accountId"
          compact
        />
      </span>
    </div>

    <article :class="$style.article" @click="navigateToDetail">
      <MkAvatar
        :avatar-url="effectiveNote.user.avatarUrl"
        :decorations="effectiveNote.user.avatarDecorations"
        :size="58"
        :alt="effectiveNote.user.username ?? undefined"
        :class="$style.avatar"
        @click="navigateToUser(effectiveNote.user.id, $event)"
        @mouseenter="onAvatarMouseEnter"
        @mouseleave="onAvatarMouseLeave"
      />

      <div :class="$style.main">
        <!-- Header -->
        <header :class="$style.header">
          <i v-if="effectiveNote.replyId" class="ti ti-arrow-back-up" :class="$style.replyIcon" />
          <span :class="$style.name">
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
          <span :class="$style.username">@{{ effectiveNote.user.username }}{{ effectiveNote.user.host ? `@${effectiveNote.user.host}` : '' }}</span>
          <span :class="$style.info">
            <span :class="$style.time">{{ formatTime(effectiveNote.createdAt) }}</span>
            <span
              v-if="effectiveNote.updatedAt"
              :class="$style.edited"
              :title="formatTime(effectiveNote.updatedAt)"
            >(edited)</span>
            <svg
              v-for="mode in activeModeFlags"
              :key="mode.key"
              :class="$style.visibilityIcon"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              :title="mode.label + ' Mode'"
            >
              <path :d="mode.icon" fill="currentColor" />
            </svg>
            <i
              v-if="effectiveNote.localOnly"
              class="ti ti-rocket-off"
              :class="$style.visibilityIcon"
              title="Local only"
            />
            <svg
              v-if="effectiveNote.visibility !== 'public'"
              :class="$style.visibilityIcon"
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
          :class="$style.instanceTicker"
          :style="instanceTickerStyle"
        >
          <img
            v-if="instanceIconUrl"
            :src="proxyThumbUrl(instanceIconUrl, 28)"
            :class="$style.instanceIcon"
            width="14"
            height="14"
            loading="lazy"
            decoding="async"
          />
          <span :class="$style.instanceName">{{ effectiveNote.user.instance.name || effectiveNote.user.host }}</span>
        </div>

        <!-- CW -->
        <div v-if="effectiveNote.cw !== null" :class="$style.cw">
          <p :class="$style.cwText">
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
          <button :class="$style.cwToggle" class="_button" @click.stop="cwExpanded = !cwExpanded">
            {{ cwExpanded ? '隠す' : 'もっと見る' }}
            <span v-if="!cwExpanded && effectiveNote.text" :class="$style.cwChars">({{ effectiveNote.text.length }}文字)</span>
          </button>
        </div>

        <!-- Body -->
        <div v-show="effectiveNote.cw === null || cwExpanded" :class="$style.body">
          <div v-if="effectiveNote.text" :class="[$style.textContainer, { [$style.collapsed]: isLongText && !longTextExpanded }]">
            <p :class="$style.text">
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
            <div v-if="isLongText && !longTextExpanded" :class="$style.longTextFade" />
          </div>
          <button v-if="isLongText" :class="$style.cwToggle" class="_button" @click.stop="longTextExpanded = !longTextExpanded">
            {{ longTextExpanded ? '隠す' : 'もっと見る' }}
            <span v-if="!longTextExpanded && effectiveNote.text" :class="$style.cwChars">({{ effectiveNote.text.length }}文字)</span>
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
          <div v-if="note.renote && note.text !== null" :class="$style.quote" @click.stop>
            <MkNote :note="note.renote" embedded />
          </div>
        </div>

        <!-- Reactions -->
        <div v-if="sortedReactions.length > 0 && !embedded" ref="reactionsAreaRef" :class="$style.reactionsArea">
          <TransitionGroup
            v-if="reactionsVisible"
            tag="div"
            name="reaction-appear"
            :class="$style.reactions"
          >
            <button
              v-for="r in sortedReactions"
              :key="r.reaction"
              v-memo="[r.reaction, r.count, effectiveNote.myReaction === r.reaction, reactionUrls[r.reaction]]"
              :class="[$style.reaction, { [$style.reacted]: effectiveNote.myReaction === r.reaction }]"
              @click.stop="canInteract && emit('react', r.reaction, effectiveNote)"
              @mouseenter="reactionUsersRef?.show($event, r.reaction, reactionUrls[r.reaction] ?? null, effectiveNote.reactions[r.reaction] ?? 0)"
              @mouseleave="reactionUsersRef?.hide()"
            >
              <img v-if="reactionUrls[r.reaction]" :src="proxyUrl(reactionUrls[r.reaction]!)" :alt="r.reaction" :class="$style.customEmoji" decoding="async" loading="lazy" @error="(e: Event) => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/emoji-unknown.svg')) img.src = '/emoji-unknown.svg' }" />
              <img v-else-if="r.reaction.startsWith(':')" src="/emoji-unknown.svg" :alt="r.reaction" :title="r.reaction" :class="$style.customEmoji" />
              <MkEmoji v-else :emoji="r.reaction" :class="$style.reactionEmoji" />
              <span :class="$style.count">{{ r.count }}</span>
            </button>
        </TransitionGroup>
        </div>

        <!-- Footer -->
        <footer v-if="!embedded" :class="$style.footer">
          <button :class="[$style.footerButton, $style.replyButton]" @click.stop="emit('reply', effectiveNote)">
            <i class="ti ti-arrow-back-up" />
            <span v-if="effectiveNote.repliesCount > 0" :class="$style.buttonCount">
              {{ effectiveNote.repliesCount }}
            </span>
          </button>
          <button v-if="canInteract" :class="[$style.footerButton, $style.renoteButton, { [$style.renoted]: isRenoted }]" @click.stop="openRenoteMenu($event)">
            <i class="ti ti-repeat" />
            <span v-if="effectiveNote.renoteCount > 0" :class="$style.buttonCount">
              {{ effectiveNote.renoteCount }}
            </span>
          </button>
          <button
            v-if="canInteract"
            :class="[$style.footerButton, $style.reactionButton]"
            @click.stop="reactionPickerRef?.open($event)"
          >
            <i class="ti ti-plus" />
          </button>
          <button
            :class="[$style.footerButton, $style.moreButton]"
            @click.stop="moreMenuRef?.open($event)"
          >
            <i class="ti ti-dots" />
          </button>
        </footer>

      </div>
    </article>
  </div>

  <!-- Renote popup menu -->
  <Teleport to="body">
    <Transition name="nd-popup">
      <div v-if="renoteMenuPos" :class="$style.renoteBackdrop" @click="closeRenoteMenu">
        <div
          :class="$style.renotePopup"
          class="_popup nd-popup-content popup-menu"
          :style="{ ...renoteMenuTheme, top: renoteMenuPos.y + 'px', left: renoteMenuPos.x + 'px' }"
          @click.stop
        >
          <button v-if="myRenoteId" :class="[$style.renotePopupItem, $style.renotePopupItemActive]" @click="handleUnrenote()">
            <i class="ti ti-trash" />
            リノート解除
          </button>
          <button v-else :class="$style.renotePopupItem" @click="emit('renote', effectiveNote); closeRenoteMenu(); isRenoted = true">
            <i class="ti ti-repeat" />
            リノート
          </button>
          <button :class="$style.renotePopupItem" @click="emit('quote', effectiveNote); closeRenoteMenu()">
            <i class="ti ti-quote" />
            引用
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <MkUserPopup
      v-if="userPopup.isVisible.value"
      :user-id="effectiveNote.user.id"
      :account-id="note._accountId"
      :x="userPopup.position.value.x"
      :y="userPopup.position.value.y"
      :theme-vars="popupTheme"
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
      :theme-vars="popupTheme"
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
    @delete-and-edit="emit('deleteAndEdit', $event)"
  />

  <NoteReactionPickerPopup
    ref="reactionPickerRef"
    :server-host="effectiveNote._serverHost"
    :account-id="note._accountId"
    @pick="(r: string) => emit('react', r, effectiveNote)"
  />
</template>

<style lang="scss" module>
.noteRoot {
  position: relative;
  font-size: 1.05em;
  contain: content;
  container-type: inline-size;

  &:not(.detailed) {
    cursor: pointer;

    > .article {
      transition: background var(--nd-duration-slow) ease;
    }

    &:hover > .article {
      background: var(--nd-panelHighlight);
    }
  }

  &.focused {
    box-shadow: inset 3px 0 0 var(--nd-accent);

    > .article {
      background: var(--nd-panelHighlight);
    }
  }
}

/* Pinned indicator */
.pinnedInfo {
  display: flex;
  padding: 12px 32px 0 32px;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  color: var(--nd-accent);
}

.pinnedIcon {
  flex-shrink: 0;
  opacity: 0.8;
}

.pinnedLabel {
  opacity: 0.8;
  font-weight: bold;
}

/* Reply-to preview */
.replyTo {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 32px 0 32px;
  cursor: pointer;
  overflow: hidden;
  opacity: 0.7;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 1;
  }
}

.replyToAvatar {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.replyToName {
  flex-shrink: 0;
  font-size: 0.8em;
  font-weight: bold;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  :deep(.custom-emoji) {
    height: 1em;
    width: auto;
  }
}

.replyToText {
  flex: 1;
  font-size: 0.8em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.7;
}

/* Reply icon in header */
.replyIcon {
  color: var(--nd-accent);
  margin-right: 0.5em;
  flex-shrink: 0;
}

/* Renote info bar */
.renoteInfo {
  display: flex;
  padding: 16px 32px 8px 32px;
  line-height: 28px;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
  color: var(--nd-renote);
}

.renoteIcon {
  flex-shrink: 0;
  opacity: 0.8;
}

.renoteAvatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.renoteUser {
  font-weight: bold;

  :deep(.custom-emoji) {
    height: 1.2em;
    width: auto;
  }
}

.renoteLabel {
  opacity: 0.7;
}

.renoteTime {
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
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.8;
  }
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

  :deep(.mfm) {
    white-space: nowrap;
  }

  :deep(.custom-emoji) {
    height: 1.2em;
    width: auto;
  }
}

.username {
  flex-shrink: 9999999;
  margin: 0 0.5em 0 0;
  text-overflow: ellipsis;
  overflow: hidden;
  opacity: 0.7;
}

/* Server badge (instance ticker) */
.instanceTicker {
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

.instanceIcon {
  flex-shrink: 0;
  border-radius: 2px;
  object-fit: contain;
}

.instanceName {
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

.visibilityIcon {
  opacity: 0.5;
  font-size: 14px;
}

/* CW */
.cw {
  margin-bottom: 4px;
}

.cwText {
  font-weight: bold;
  margin: 0;
}

.cwToggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
  padding: 4px 12px;
  min-height: 36px;
  border: none;
  border-radius: var(--nd-radius-full);
  background: var(--nd-accentedBg);
  color: var(--nd-accent);
  font-size: 0.8em;
  font-weight: normal;
  cursor: pointer;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.cwChars {
  opacity: 0.7;
  font-weight: normal;
}

/* Body */
.body {
  overflow-wrap: break-word;
}

.textContainer {
  position: relative;

  &.collapsed {
    max-height: 9em;
    overflow: hidden;
  }
}

.longTextFade {
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

  > :global(.note-root) {
    padding: 16px;
    border: dashed 1px var(--nd-renote);
    border-radius: var(--nd-radius-md);
  }
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
  border-radius: var(--nd-radius-sm);
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

  &:hover {
    background: rgba(0, 0, 0, 0.1);
  }

  &:active {
    animation: reaction-bounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  &.reacted,
  &.reacted:hover {
    background: var(--nd-accentedBg);
    color: var(--nd-accent);
    box-shadow: 0 0 0 1px var(--nd-accent) inset;
  }

  .customEmoji {
    height: 1.25em;
    min-width: 1.25em;
    max-width: 70px;
    object-fit: contain;
  }

  .count {
    font-size: 0.7em;
    line-height: 42px;
    margin: 0 0 0 4px;
  }

  &.reacted .count {
    color: var(--nd-accent);
  }
}

@keyframes reaction-bounce {
  0% { transform: scale(1); }
  30% { transform: scale(1.25); }
  60% { transform: scale(0.95); }
  100% { transform: scale(1); }
}

.customEmoji {
  height: 2em;
  min-width: 2em;
  width: auto;
  vertical-align: middle;
  object-fit: contain;
}

.reactionEmojiFallback {
  font-size: 0.85em;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 5em;
  white-space: nowrap;
}

.reactionEmoji :deep(.twemoji) {
  height: 1.25em;
}

.count {
  font-size: 0.7em;
  line-height: 42px;
  margin: 0 0 0 4px;
}

/* Footer */
.footer {
  display: flex;
  align-items: center;
  margin-top: 4px;
  margin-bottom: -14px;
}

.footerButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  min-height: 42px;
  min-width: 44px;
  margin-right: 28px;
  border: none;
  background: none;
  cursor: pointer;
  color: color-mix(in srgb, var(--nd-panel) 30%, var(--nd-fg) 70%);
  font-size: 1em;
  transition: color var(--nd-duration-base), transform var(--nd-duration-fast);

  &:active {
    transform: scale(0.9);
  }

  &:hover {
    color: var(--nd-fgHighlighted);
  }
}

.replyButton:hover {
  color: var(--nd-replyHover);
}

.renoteButton:hover,
.renoteButton.renoted {
  color: var(--nd-renote);
}

.reactionButton:hover {
  color: var(--nd-reactionHover);
}

.reactionButton:active {
  animation: reaction-bounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.moreButton:hover {
  color: var(--nd-fgHighlighted);
}

.buttonCount {
  font-size: 0.85em;
}

/* Renote popup menu */
.renoteBackdrop {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup);
  background: transparent;
}

.renotePopup {
  position: fixed;
  min-width: 180px;
  max-width: 250px;
  padding: 6px 0;
  z-index: calc(var(--nd-z-popup) + 1);
}

.renotePopupItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 22px;
  border: none;
  border-radius: 0;
  background: none;
  cursor: pointer;
  color: var(--nd-fg);
  font-size: 0.85em;
  text-align: left;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    color: var(--nd-renote);
  }

  :global(.ti) {
    opacity: 0.8;
    flex-shrink: 0;
    width: 1em;
    text-align: center;
  }
}

.renotePopupItemActive {
  color: var(--nd-renote);
}

/* Divider between notes */
.noteRoot + .noteRoot {
  border-top: 1px solid var(--nd-divider);
}

/* Container query responsive breakpoints */
@container (max-width: 580px) {
  .noteRoot { font-size: 0.95em; }
  .article { padding: 24px 26px; }
  .renoteInfo { padding: 12px 26px 6px 26px; }
  .pinnedInfo { padding: 10px 26px 0 26px; }
  .replyTo { padding: 10px 26px 0 26px; }
}

@container (max-width: 500px) {
  .noteRoot { font-size: 0.9em; }
  .article { padding: 20px 22px; }
  .renoteInfo { padding: 8px 22px 4px 22px; }
  .pinnedInfo { padding: 8px 22px 0 22px; }
  .replyTo { padding: 8px 22px 0 22px; }
  .footer { margin-bottom: -8px; }
  .instanceName { max-width: 120px; }
}

@container (max-width: 480px) {
  .article { padding: 14px 16px; }
  .renoteInfo { padding: 8px 16px 4px 16px; }
  .pinnedInfo { padding: 8px 16px 0 16px; }
  .replyTo { padding: 8px 16px 0 16px; }
}

@container (max-width: 450px) {
  .avatar { margin: 0 10px 0 0; }
}

@container (max-width: 400px) {
  .footerButton { margin-right: 18px; }
}

@container (max-width: 350px) {
  .footerButton { margin-right: 12px; }
}

@container (max-width: 300px) {
  .footerButton { margin-right: 8px; }
  .reaction { height: 32px; font-size: 1em; border-radius: 4px; }
  .reaction .count { font-size: 0.9em; line-height: 32px; }
}
</style>

<style>
/* Reaction appear/leave animation (TransitionGroup needs global classes) */
.reaction-appear-enter-active,
.reaction-appear-leave-active {
  transition:
    opacity 0.2s cubic-bezier(0, 0.5, 0.5, 1),
    transform 0.2s cubic-bezier(0, 0.5, 0.5, 1);
}

.reaction-appear-enter-from {
  opacity: 0;
  transform: scale(0.7);
}

.reaction-appear-leave-active {
  position: absolute;
}

.reaction-appear-leave-to {
  opacity: 0;
  transform: scale(0.7);
}
</style>
