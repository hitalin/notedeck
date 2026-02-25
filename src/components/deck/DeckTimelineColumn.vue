<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import DeckColumn from './DeckColumn.vue'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import type { NormalizedNote, TimelineType } from '@/adapters/types'
import { useDeckStore } from '@/stores/deck'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { AppError } from '@/utils/errors'

const props = defineProps<{
  column: DeckColumnType
}>()

const deckStore = useDeckStore()
const {
  account,
  columnThemeVars,
  isLoading,
  error,
  initAdapter,
  getAdapter,
  setSubscription,
  disconnect,
  postForm,
  handlers,
  scroller,
  onScroll,
} = useColumnSetup(() => props.column)

const MAX_NOTES = 500
const notes = shallowRef<NormalizedNote[]>([])
const pendingNotes = shallowRef<NormalizedNote[]>([])
const isAtTop = ref(true)
const tlType = ref<TimelineType>(props.column.tl || 'home')

const TL_TYPES: { value: TimelineType; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'local', label: 'Local' },
  { value: 'social', label: 'Social' },
  { value: 'global', label: 'Global' },
]

const TL_ICONS: Record<TimelineType, string> = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-2 0h2',
  local: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-18c2.8 0 5 4 5 9s-2.2 9-5 9-5-4-5-9 2.2-9 5-9zM3 12h18',
  social: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-18c2.8 0 5 4 5 9s-2.2 9-5 9-5-4-5-9 2.2-9 5-9zM3 12h18M3.5 7.5h17M3.5 16.5h17',
  global: 'M22 12A10 10 0 112 12a10 10 0 0120 0zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z',
}

const currentTlIcon = computed(() => TL_ICONS[tlType.value])

function columnTitle(): string {
  const opt = TL_TYPES.find((o) => o.value === tlType.value) ?? TL_TYPES[0]!
  return opt.label
}

async function connect(useCache = false) {
  error.value = null
  isLoading.value = true

  // 1. Instant cache display (initial mount only)
  if (useCache && props.column.accountId) {
    try {
      const cached = await invoke<NormalizedNote[]>('api_get_cached_timeline', {
        accountId: props.column.accountId,
        limit: 40,
      })
      if (cached.length > 0) {
        notes.value = cached
      }
    } catch {
      // non-critical
    }
  }

  try {
    const adapter = await initAdapter()
    if (!adapter) return

    // 2. Differential fetch: use sinceId if we have cached notes
    const sinceId = notes.value.length > 0 ? notes.value[0]!.id : undefined
    const fetched = await adapter.api.getTimeline(tlType.value, sinceId ? { sinceId } : undefined)

    if (sinceId && fetched.length > 0) {
      // Merge new notes on top of cached
      const existingIds = new Set(notes.value.map(n => n.id))
      const newNotes = fetched.filter(n => !existingIds.has(n.id))
      notes.value = [...newNotes, ...notes.value]
    } else if (fetched.length > 0) {
      notes.value = fetched
    }
    // If fetched is empty and we have cache, keep showing cache

    adapter.stream.connect()
    setSubscription(adapter.stream.subscribeTimeline(
      tlType.value,
      (note: NormalizedNote) => {
        if (isAtTop.value) {
          const updated = [note, ...notes.value]
          notes.value = updated.length > MAX_NOTES ? updated.slice(0, MAX_NOTES) : updated
        } else {
          pendingNotes.value = [note, ...pendingNotes.value]
          if (pendingNotes.value.length > MAX_NOTES) {
            pendingNotes.value = pendingNotes.value.slice(0, MAX_NOTES)
          }
        }
      },
    ))
  } catch (e) {
    // 3. Offline fallback: keep cached notes if available
    if (notes.value.length === 0) {
      error.value = AppError.from(e)
    }
  } finally {
    isLoading.value = false
  }
}

function flushPending() {
  if (pendingNotes.value.length === 0) return
  const existingIds = new Set(notes.value.map(n => n.id))
  const newNotes = pendingNotes.value.filter(n => !existingIds.has(n.id))
  const merged = [...newNotes, ...notes.value]
  notes.value = merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
  pendingNotes.value = []
}

function scrollToTop() {
  const el = scroller.value?.$el as HTMLElement | undefined
  if (el) el.scrollTop = 0
  isAtTop.value = true
  flushPending()
}

async function switchTl(type: TimelineType) {
  if (type === tlType.value) return
  disconnect()
  notes.value = []
  pendingNotes.value = []
  tlType.value = type
  deckStore.updateColumn(props.column.id, { tl: type })
  await connect()
}

async function loadMore() {
  const adapter = getAdapter()
  if (!adapter || isLoading.value || notes.value.length === 0) return
  const lastNote = notes.value[notes.value.length - 1]!
  isLoading.value = true
  try {
    const older = await adapter.api.getTimeline(tlType.value, {
      untilId: lastNote.id,
    })
    notes.value = [...notes.value, ...older]
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

function handleScroll() {
  const el = scroller.value?.$el as HTMLElement | undefined
  if (el) {
    isAtTop.value = el.scrollTop <= 10
    if (isAtTop.value && pendingNotes.value.length > 0) {
      flushPending()
    }
  }
  onScroll(loadMore)
}

onMounted(() => {
  connect(true)
})

onUnmounted(() => {
  disconnect()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="columnTitle()"
    :theme-vars="columnThemeVars"
  >
    <template #header-icon>
      <svg class="tl-header-icon" viewBox="0 0 24 24" width="14" height="14">
        <path :d="currentTlIcon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
    </template>

    <template #header-meta>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <span class="header-host">{{ account.host }}</span>
      </div>
    </template>

    <template #header-extra>
      <div class="tl-tabs">
        <button
          v-for="opt in TL_TYPES"
          :key="opt.value"
          class="_button tl-tab"
          :class="{ active: tlType === opt.value }"
          :title="opt.label"
          @click="switchTl(opt.value)"
        >
          <svg class="tl-tab-icon" viewBox="0 0 24 24" width="16" height="16">
            <path :d="TL_ICONS[opt.value]" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
        </button>
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="error" class="column-empty column-error">
      {{ error.message }}
    </div>

    <div v-else class="tl-body">
      <div v-if="isLoading && notes.length === 0" class="column-empty">
        Loading...
      </div>

      <template v-else>
        <button
          v-if="pendingNotes.length > 0"
          class="new-notes-banner _button"
          @click="scrollToTop"
        >
          {{ pendingNotes.length }} new notes
        </button>

        <DynamicScroller
          ref="scroller"
          class="tl-scroller"
          :items="notes"
          :min-item-size="120"
          :buffer="400"
          key-field="id"
          @scroll.passive="handleScroll"
        >
        <template #default="{ item, active, index }">
          <DynamicScrollerItem
            :item="item"
            :active="active"
            :data-index="index"
          >
            <MkNote
              :note="item"
              @react="(reaction: string) => handlers.reaction(item, reaction)"
              @reply="handlers.reply"
              @renote="handlers.renote"
              @quote="handlers.quote"
            />
          </DynamicScrollerItem>
        </template>

        <template #after>
          <div v-if="isLoading && notes.length > 0" class="loading-more">
            Loading...
          </div>
        </template>
      </DynamicScroller>
      </template>
    </div>
  </DeckColumn>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && column.accountId"
      :account-id="column.accountId"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      @close="postForm.close"
      @posted="postForm.close"
    />
  </Teleport>
</template>

<style scoped>
.tl-header-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.header-account {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  flex-shrink: 0;
}

.header-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}

.header-host {
  font-size: 0.75em;
  font-weight: normal;
  opacity: 0.6;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-tabs {
  display: flex;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-panelHeaderBg);
}

.tl-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 0;
  opacity: 0.4;
  transition: opacity 0.15s, background 0.15s;
  position: relative;
}

.tl-tab:hover {
  opacity: 0.7;
  background: var(--nd-buttonHoverBg);
}

.tl-tab.active {
  opacity: 1;
}

.tl-tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 3px;
  background: var(--nd-accent);
  border-radius: 999px 999px 0 0;
}

.tl-tab-icon {
  color: currentColor;
}

.tl-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tl-scroller {
  flex: 1;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  will-change: scroll-position;
}

.tl-scroller :deep(.vue-recycle-scroller__item-view) {
  will-change: transform;
}

.column-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 0.85em;
}

.column-error {
  color: var(--nd-love);
  opacity: 1;
}

.new-notes-banner {
  display: block;
  width: 100%;
  padding: 8px 0;
  text-align: center;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-accent);
  background: var(--nd-accentedBg);
  border-bottom: 1px solid var(--nd-divider);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}

.new-notes-banner:hover {
  background: var(--nd-buttonHoverBg);
}

.loading-more {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
}
</style>
