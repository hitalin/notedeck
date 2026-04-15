<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type {
  NormalizedNote,
  NormalizedUser,
  NoteVisibility,
} from '@/adapters/types'
import ColumnEmptyState from '@/components/common/ColumnEmptyState.vue'
import MkNote from '@/components/common/MkNote.vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import {
  deleteMemo,
  ensureMemosLoaded,
  loadAllMemos,
  memosVersion,
  type StoredMemo,
} from '@/composables/useMemos'
import { useAccountsStore } from '@/stores/accounts'
import { useConfirm } from '@/stores/confirm'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useToast } from '@/stores/toast'
import { useUiStore } from '@/stores/ui'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const accountsStore = useAccountsStore()
const uiStore = useUiStore()
const { confirm } = useConfirm()
const toast = useToast()
const { columnThemeVars } = useColumnTheme(() => props.column)

/**
 * Memos aren't account-bound. The preview note uses a placeholder "memo"
 * identity so MkNote renders without implying a specific server account.
 */
const MEMO_USER: NormalizedUser = {
  id: 'memo',
  username: 'memo',
  host: null,
  name: 'メモ',
  avatarUrl: '/avatar-guest.svg',
}

interface MemoContext {
  kind: 'reply' | 'renote' | 'note' | 'channel-note'
  channelId: string | null
  refId: string | null
}

interface MemoEntry {
  key: string
  memo: StoredMemo
  context: MemoContext
  note: NormalizedNote
}

function parseMemoKey(key: string): MemoContext {
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

function toPreviewNote(
  key: string,
  stored: StoredMemo,
  ctx: MemoContext,
): NormalizedNote {
  const d = stored.data
  const owner = accountsStore.activeAccountId ?? 'memo'
  return {
    id: `memo:${key}`,
    _accountId: owner,
    _serverHost: '',
    createdAt: stored.updatedAt,
    text: d.text || null,
    cw: d.showCw && d.cw ? d.cw : null,
    user: MEMO_USER,
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
  () => true,
  async () => {
    await ensureMemosLoaded()
    loaded.value = true
  },
  { immediate: true },
)

const entries = computed<MemoEntry[]>(() => {
  void memosVersion.value
  if (!loaded.value) return []
  const map = loadAllMemos()
  const out: MemoEntry[] = []
  for (const [key, memo] of Object.entries(map)) {
    const ctx = parseMemoKey(key)
    out.push({ key, memo, context: ctx, note: toPreviewNote(key, memo, ctx) })
  }
  out.sort((a, b) => b.memo.updatedAt.localeCompare(a.memo.updatedAt))
  return out
})

const memoCount = computed(() => entries.value.length)

function contextLabel(ctx: MemoContext): string {
  switch (ctx.kind) {
    case 'reply':
      return '返信'
    case 'renote':
      return '引用'
    case 'channel-note':
      return 'チャンネル投稿'
    default:
      return ''
  }
}

function contextIcon(ctx: MemoContext): string {
  switch (ctx.kind) {
    case 'reply':
      return 'ti ti-arrow-back-up'
    case 'renote':
      return 'ti ti-quote'
    case 'channel-note':
      return 'ti ti-device-tv'
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

function onEdit(entry: MemoEntry) {
  uiStore.requestComposeWithMemo(entry.key, entry.memo)
  closeMenu()
}

async function onDelete(entry: MemoEntry) {
  closeMenu()
  const ok = await confirm({
    title: 'メモを削除',
    message: '選択したメモを削除しますか？',
    okLabel: '削除',
    type: 'danger',
  })
  if (!ok) return
  deleteMemo(entry.key)
  toast.show('メモを削除しました', 'info')
}

// --- Context menu ---
const menuState = ref<{
  x: number
  y: number
  entry: MemoEntry
} | null>(null)
const menuRef = ref<HTMLElement | null>(null)

function onContextMenu(e: MouseEvent, entry: MemoEntry) {
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
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? 'メモ'"
    :theme-vars="columnThemeVars"
  >
    <template #header-icon>
      <i class="ti ti-notes" />
    </template>

    <ColumnEmptyState
      v-if="loaded && memoCount === 0"
      message="メモはありません"
    />

    <div v-else :class="$style.list">
      <div
        v-for="entry in entries"
        :key="entry.key"
        :class="$style.item"
        @contextmenu.capture="onContextMenu($event, entry)"
      >
        <div
          v-if="contextLabel(entry.context) || entry.memo.data.scheduledAt"
          :class="$style.meta"
        >
          <span
            v-if="contextLabel(entry.context)"
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
            v-if="entry.memo.data.scheduledAt"
            :class="$style.metaScheduled"
            :title="entry.memo.data.scheduledAt"
          >
            <i class="ti ti-clock" />
            {{ formatScheduledAt(entry.memo.data.scheduledAt) }}
          </span>
        </div>

        <MkNote :note="entry.note" />

        <div :class="$style.itemActions">
          <button
            class="_button"
            :class="$style.itemEditBtn"
            title="編集（投稿フォームに反映）"
            @click.stop="onEdit(entry)"
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
            @click="onEdit(menuState.entry)"
          >
            <i class="ti ti-pencil" />
            編集（投稿フォームに反映）
          </button>
          <div :class="$style.menuDivider" />
          <button
            class="_button"
            :class="[$style.menuItem, $style.menuItemDanger]"
            @click="onDelete(menuState.entry)"
          >
            <i class="ti ti-trash" />
            削除
          </button>
        </div>
      </div>
    </Teleport>
  </DeckColumn>
</template>

<style lang="scss" module>
.countBadge {
  font-size: 0.75em;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  font-weight: 600;
}

.list {
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

.itemActions {
  position: absolute;
  top: 8px;
  right: 8px;
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

.menuBackdrop {
  position: fixed;
  inset: 0;
  z-index: 2000;
}

.menu {
  position: fixed;
  min-width: 220px;
  padding: 6px;
  border-radius: 10px;
  background: var(--nd-popup);
  box-shadow: var(--nd-shadow-m);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.menuItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 0.88em;
  color: var(--nd-fg);
  border-radius: var(--nd-radius-sm);
  transition: background var(--nd-duration-base);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.06), rgba(255, 255, 255, 0.06));
  }
}

.menuItemDanger {
  color: var(--nd-danger, #e64c4c);
}

.menuDivider {
  height: 1px;
  margin: 2px 6px;
  background: var(--nd-divider);
}
</style>
