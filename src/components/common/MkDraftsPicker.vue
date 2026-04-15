<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type {
  NormalizedNote,
  NormalizedUser,
  NoteVisibility,
} from '@/adapters/types'
import ColumnEmptyState from '@/components/common/ColumnEmptyState.vue'
import MkNote from '@/components/common/MkNote.vue'
import {
  deleteAllDrafts,
  deleteDraft,
  draftsVersion,
  ensureDraftsLoaded,
  loadAllDrafts,
  type StoredDraft,
} from '@/composables/useDrafts'
import { type Account, useAccountsStore } from '@/stores/accounts'
import { useConfirm } from '@/stores/confirm'
import { useServersStore } from '@/stores/servers'
import { useThemeStore } from '@/stores/theme'
import { useToast } from '@/stores/toast'

const props = defineProps<{
  accountId: string
}>()

const emit = defineEmits<{
  pick: [draft: StoredDraft]
  close: []
}>()

const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const themeStore = useThemeStore()
const { confirm } = useConfirm()
const toast = useToast()

const account = computed<Account | undefined>(() =>
  accountsStore.accounts.find((a) => a.id === props.accountId),
)

/** Per-account custom server theme — same vars the post form uses. */
const themeVars = computed(() =>
  themeStore.getStyleVarsForAccount(props.accountId),
)

/** Misskey server's empty state image (infoImageUrl) for the current account. */
const serverInfoImageUrl = computed(() => {
  const acc = account.value
  if (!acc) return undefined
  return serversStore.getServer(acc.host)?.infoImageUrl
})

interface DraftContext {
  kind: 'reply' | 'renote' | 'note' | 'channel-note' | 'legacy'
  channelId: string | null
  refId: string | null
}

interface DraftEntry {
  key: string
  draft: StoredDraft
  context: DraftContext
  note: NormalizedNote
}

function parseDraftKey(key: string): DraftContext {
  if (key.startsWith('legacy:')) {
    return { kind: 'legacy', channelId: null, refId: key.slice(7) }
  }
  let rest = key
  let channelId: string | null = null
  if (rest.startsWith('channel:')) {
    const m = rest.slice(8).match(/^(.*?)(?=(?:renote|reply|note):)/)
    if (m) {
      channelId = m[1] ?? null
      rest = rest.slice(8 + (m[1]?.length ?? 0))
    }
  }
  const idx = rest.indexOf(':')
  if (idx < 0) return { kind: 'note', channelId, refId: null }
  const prefix = rest.slice(0, idx)
  const refId = rest.slice(idx + 1) || null
  if (prefix === 'renote') return { kind: 'renote', channelId, refId }
  if (prefix === 'reply') return { kind: 'reply', channelId, refId }
  if (prefix === 'note') {
    return {
      kind: channelId ? 'channel-note' : 'note',
      channelId,
      refId,
    }
  }
  return { kind: 'note', channelId, refId: null }
}

function userFromAccount(acc: Account): NormalizedUser {
  return {
    id: acc.userId,
    username: acc.username,
    host: null,
    name: acc.displayName ?? null,
    avatarUrl: acc.avatarUrl ?? null,
  }
}

function toPreviewNote(
  acc: Account,
  key: string,
  stored: StoredDraft,
  ctx: DraftContext,
): NormalizedNote {
  const d = stored.data
  return {
    id: `draft:${acc.id}:${key}`,
    _accountId: acc.id,
    _serverHost: acc.host,
    createdAt: stored.updatedAt,
    text: d.text || null,
    cw: d.showCw && d.cw ? d.cw : null,
    user: userFromAccount(acc),
    visibility: d.visibility as NoteVisibility,
    emojis: {},
    reactionEmojis: {},
    reactions: {},
    renoteCount: 0,
    repliesCount: 0,
    files: [],
    localOnly: d.localOnly,
    replyId: ctx.kind === 'reply' ? ctx.refId : null,
    renoteId: ctx.kind === 'renote' ? ctx.refId : null,
    channelId: ctx.channelId,
  }
}

const loaded = ref(false)

watch(
  () => props.accountId,
  async (id) => {
    loaded.value = false
    await ensureDraftsLoaded(id)
    loaded.value = true
  },
  { immediate: true },
)

const entries = computed<DraftEntry[]>(() => {
  // Track reactive version so save/delete from anywhere re-renders us.
  void draftsVersion.value
  if (!loaded.value || !account.value) return []
  const map = loadAllDrafts(props.accountId)
  const acc = account.value
  const out: DraftEntry[] = []
  for (const [key, draft] of Object.entries(map)) {
    const ctx = parseDraftKey(key)
    out.push({
      key,
      draft,
      context: ctx,
      note: toPreviewNote(acc, key, draft, ctx),
    })
  }
  out.sort((a, b) => b.draft.updatedAt.localeCompare(a.draft.updatedAt))
  return out
})

const draftCount = computed(() => entries.value.length)

function contextLabel(ctx: DraftContext): string {
  switch (ctx.kind) {
    case 'reply':
      return '返信'
    case 'renote':
      return '引用'
    case 'channel-note':
      return 'チャンネル投稿'
    case 'legacy':
      return '旧下書き'
    default:
      return '新規ノート'
  }
}

function contextIcon(ctx: DraftContext): string {
  switch (ctx.kind) {
    case 'reply':
      return 'ti ti-arrow-back-up'
    case 'renote':
      return 'ti ti-quote'
    case 'channel-note':
      return 'ti ti-device-tv'
    case 'legacy':
      return 'ti ti-archive'
    default:
      return 'ti ti-pencil'
  }
}

function truncate(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function formatScheduledAt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function onPick(entry: DraftEntry) {
  emit('pick', entry.draft)
}

// --- Custom context menu (overrides MkNote's default NoteMoreMenu) ---
const menuState = ref<{
  x: number
  y: number
  entry: DraftEntry
} | null>(null)
const menuRef = ref<HTMLElement | null>(null)

function onContextMenu(e: MouseEvent, entry: DraftEntry) {
  e.preventDefault()
  e.stopPropagation()
  menuState.value = { x: e.clientX, y: e.clientY, entry }
  void nextTick(() => {
    const el = menuRef.value
    if (!el || !menuState.value) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const nx = Math.min(menuState.value.x, vw - rect.width - 4)
    const ny = Math.min(menuState.value.y, vh - rect.height - 4)
    menuState.value = { x: nx, y: ny, entry: menuState.value.entry }
  })
}

function closeMenu() {
  menuState.value = null
}

async function onDelete(entry: DraftEntry) {
  const ok = await confirm({
    title: '下書きを削除',
    message: '選択した下書きを削除しますか？',
    okLabel: '削除',
    type: 'danger',
  })
  if (!ok) return
  deleteDraft(props.accountId, entry.key)
  toast.show('下書きを削除しました', 'info')
}

async function onDeleteAll() {
  if (draftCount.value === 0) return
  const ok = await confirm({
    title: 'すべての下書きを削除',
    message: `下書き ${draftCount.value} 件をすべて削除しますか？`,
    okLabel: 'すべて削除',
    type: 'danger',
  })
  if (!ok) return
  deleteAllDrafts(props.accountId)
  toast.show('下書きをすべて削除しました', 'info')
}
</script>

<template>
  <div :class="$style.draftsPicker" :style="themeVars" @click.stop>
    <!-- Header -->
    <div :class="$style.dpHeader">
      <span :class="$style.dpTitle">
        <i class="ti ti-notes" />
        下書き
        <span :class="$style.dpCount">{{ draftCount }}</span>
      </span>
      <button
        v-if="draftCount > 0"
        class="_button"
        :class="$style.dpHeaderBtn"
        title="すべて削除"
        @click="onDeleteAll"
      >
        <i class="ti ti-trash" />
      </button>
      <button class="_button" :class="$style.dpHeaderBtn" title="閉じる" @click="emit('close')">
        <i class="ti ti-x" />
      </button>
    </div>

    <!-- Body -->
    <div :class="$style.dpBody">
      <div v-if="!loaded" :class="$style.dpEmpty">読み込み中...</div>
      <ColumnEmptyState
        v-else-if="draftCount === 0"
        message="下書きはありません"
        :image-url="serverInfoImageUrl"
      />
      <div v-else :class="$style.dpList">
        <div
          v-for="entry in entries"
          :key="entry.key"
          :class="$style.item"
          @contextmenu.capture="onContextMenu($event, entry)"
        >
          <div :class="$style.meta">
            <span
              v-if="entry.context.kind !== 'note'"
              :class="$style.metaCtx"
            >
              <i :class="contextIcon(entry.context)" />
              {{ contextLabel(entry.context) }}
            </span>
            <span
              v-if="entry.context.refId && (entry.context.kind === 'reply' || entry.context.kind === 'renote')"
              :class="$style.metaRef"
              :title="entry.context.refId"
            >{{ truncate(entry.context.refId, 14) }}</span>
            <span
              v-if="entry.context.channelId"
              :class="$style.metaChannel"
              :title="entry.context.channelId"
            >
              <i class="ti ti-device-tv" />
              {{ truncate(entry.context.channelId, 12) }}
            </span>
            <span
              v-if="entry.draft.data.scheduledAt"
              :class="$style.metaScheduled"
              :title="entry.draft.data.scheduledAt"
            >
              <i class="ti ti-clock" />
              {{ formatScheduledAt(entry.draft.data.scheduledAt) }}
            </span>
            <span
              v-if="entry.draft.data.showPoll && entry.draft.data.pollChoices.length"
              :class="$style.metaBadge"
            >
              <i class="ti ti-chart-bar" />
              投票
              {{ entry.draft.data.pollChoices.filter((c) => c.trim()).length }}択
            </span>
            <span v-if="entry.draft.data.fileIds.length" :class="$style.metaBadge">
              <i class="ti ti-paperclip" />
              添付 {{ entry.draft.data.fileIds.length }}
            </span>
          </div>
          <button
            class="_button"
            :class="$style.itemNoteBtn"
            title="この下書きを復元"
            @click="onPick(entry)"
          >
            <MkNote :note="entry.note" embedded />
          </button>
          <div :class="$style.itemActions">
            <button
              class="_button"
              :class="$style.itemEditBtn"
              title="編集（投稿フォームに反映）"
              @click.stop="onPick(entry)"
            >
              <i class="ti ti-pencil" />
            </button>
            <button
              class="_button"
              :class="$style.itemRemoveBtn"
              title="削除"
              @click.stop="onDelete(entry)"
            >
              <i class="ti ti-x" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Custom right-click menu (overrides MkNote's default NoteMoreMenu) -->
    <Teleport to="body">
      <div
        v-if="menuState"
        :class="$style.menuBackdrop"
        @click="closeMenu"
        @contextmenu.prevent="closeMenu"
      >
        <div
          ref="menuRef"
          class="_popup"
          :class="$style.menu"
          :style="{ top: `${menuState.y}px`, left: `${menuState.x}px` }"
          @click.stop
          @contextmenu.stop.prevent
        >
          <button
            class="_button"
            :class="$style.menuItem"
            @click="onPick(menuState.entry); closeMenu()"
          >
            <i class="ti ti-arrow-back-up" />
            復元して投稿フォームに反映
          </button>
          <div :class="$style.menuDivider" />
          <button
            class="_button"
            :class="[$style.menuItem, $style.menuItemDanger]"
            @click="onDelete(menuState.entry); closeMenu()"
          >
            <i class="ti ti-trash" />
            削除
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" module>
.draftsPicker {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 520px;
  max-height: min(75vh, 640px);
  margin: 0 16px 16px;
  background: var(--nd-panelBg, var(--nd-popup));
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px var(--nd-shadow);
}

.dpHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--nd-divider);
}

.dpTitle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9em;
  font-weight: 600;
  flex: 1;
  min-width: 0;
}

.dpCount {
  font-size: 0.75em;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  font-weight: 600;
}

.dpHeaderBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.6;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

.dpBody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.dpList {
  display: flex;
  flex-direction: column;
}

.item {
  position: relative;
  border-bottom: 1px solid var(--nd-divider);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.015), rgba(255, 255, 255, 0.015));
  }
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 8px 14px 0;
  font-size: 0.75em;
  opacity: 0.8;
}

.metaCtx {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}

.metaRef {
  font-family: var(--nd-font-mono, monospace);
  opacity: 0.7;
}

.metaChannel {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 999px;
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.06));
}

.metaScheduled {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);
  color: var(--nd-accent);
}

.metaBadge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  opacity: 0.7;
}

.itemNoteBtn {
  display: block;
  width: 100%;
  text-align: left;
  cursor: pointer;
}

/* Hover-revealed action buttons (matches AppearanceEditor theme grid pattern) */
.itemActions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
  z-index: 1;
  opacity: 0;
  transition: opacity var(--nd-duration-fast);

  .item:hover & {
    opacity: 1;
  }
}

.itemEditBtn,
.itemRemoveBtn {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: filter var(--nd-duration-base);

  &:hover {
    filter: brightness(0.85);
  }
}

.itemEditBtn {
  background: var(--nd-accent, #86b300);
}

.itemRemoveBtn {
  background: var(--nd-error, #ec4137);
}

.dpEmpty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 16px;
  text-align: center;
}
</style>
