<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import type { NormalizedNote } from '@/adapters/types'
import AvatarStack from '@/components/common/AvatarStack.vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import type { NoteColumnConfig } from '@/composables/useNoteColumn'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useNoteStore } from '@/stores/notes'
import { AppError } from '@/utils/errors'
import DeckColumn from './DeckColumn.vue'
import DeckNoteColumn from './DeckNoteColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const isCrossAccount = computed(() => props.column.accountId == null)
const accountsStore = useAccountsStore()
const multiAdapters = useMultiAccountAdapters()
const noteStore = useNoteStore()

// Single-account config
const noteColumnConfig: NoteColumnConfig = {
  getColumn: () => props.column,
  fetch: (adapter, opts) =>
    adapter.api.getMentions({ ...opts, visibility: 'specified' }),
  cache: { getKey: () => 'specified' },
  streaming: {
    subscribe: (adapter, enqueue, callbacks) =>
      adapter.stream.subscribeMentions((note) => {
        if (note.visibility === 'specified') enqueue(note)
      }, callbacks),
  },
}

// Cross-account state
const { columnThemeVars, isLoading, error, handlers, scroller, onScroll } =
  useColumnSetup(() => props.column)

const notes = shallowRef<NormalizedNote[]>([])
const noteScrollerRef = ref<{
  getElement: () => HTMLElement | null
  scrollToIndex: (
    index: number,
    opts?: { align?: string; behavior?: string },
  ) => void
} | null>(null)

watch(
  noteScrollerRef,
  () => {
    scroller.value = noteScrollerRef.value?.getElement() ?? null
  },
  { flush: 'post' },
)

function scrollToTop() {
  scroller.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

async function connectCrossAccount() {
  error.value = null
  isLoading.value = true
  const accounts = accountsStore.accounts.filter((a) => a.hasToken)

  try {
    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const adapter = await multiAdapters.getOrCreate(acc.id)
        if (!adapter) return []
        return adapter.api.getMentions({ visibility: 'specified' })
      }),
    )

    const allNotes: NormalizedNote[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        allNotes.push(...r.value)
      }
    }

    const seen = new Set<string>()
    notes.value = allNotes
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .filter((n) => {
        if (seen.has(n.id)) return false
        seen.add(n.id)
        return true
      })
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

async function loadMoreCrossAccount() {
  if (isLoading.value || notes.value.length === 0) return
  isLoading.value = true
  const accounts = accountsStore.accounts.filter((a) => a.hasToken)

  try {
    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const adapter = await multiAdapters.getOrCreate(acc.id)
        if (!adapter) return []
        const lastForAccount = [...notes.value]
          .reverse()
          .find((n) => n._accountId === acc.id)
        if (!lastForAccount)
          return adapter.api.getMentions({ visibility: 'specified' })
        return adapter.api.getMentions({
          untilId: lastForAccount.id,
          visibility: 'specified',
        })
      }),
    )

    const olderNotes: NormalizedNote[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        olderNotes.push(...r.value)
      }
    }

    const seen = new Set(notes.value.map((n) => n.id))
    const newOlder = olderNotes
      .filter((n) => !seen.has(n.id))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )

    notes.value = [...notes.value, ...newOlder]
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

function handleScroll() {
  onScroll(loadMoreCrossAccount)
}

async function removeNote(note: NormalizedNote) {
  const adapter = await multiAdapters.getOrCreate(note._accountId)
  if (!adapter) return
  try {
    await adapter.api.deleteNote(note.id)
  } catch {
    return
  }
  notes.value = notes.value.filter((n) => n.id !== note.id)
  noteStore.remove(note.id)
}

onMounted(() => {
  if (isCrossAccount.value) {
    connectCrossAccount()
  }
})
</script>

<template>
  <!-- Cross-account mode -->
  <DeckColumn
    v-if="isCrossAccount"
    :column-id="column.id"
    :title="column.name || 'ダイレクト'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop"
  >
    <template #header-icon>
      <i class="ti ti-mail" :class="$style.tlHeaderIcon" />
    </template>

    <template #header-meta>
      <button
        class="_button"
        :class="$style.headerRefresh"
        title="更新"
        :disabled="isLoading"
        @click.stop="connectCrossAccount"
      >
        <i class="ti ti-refresh" :class="{ [String($style.spin)]: isLoading }" />
      </button>
      <AvatarStack :size="20" />
    </template>

    <div v-if="error" :class="[$style.columnEmpty, $style.columnError]">
      {{ error.message }}
    </div>

    <div v-else :class="$style.tlBody">
      <div v-if="notes.length === 0 && !isLoading" :class="$style.columnEmpty">
        ダイレクトメッセージはありません
      </div>

      <NoteScroller
        v-else
        ref="noteScrollerRef"
        :items="notes"
        :class="$style.tlScroller"
        @scroll="handleScroll"
        @near-end="loadMoreCrossAccount"
      >
        <template #default="{ item }">
          <div>
            <MkNote
              :note="item"
              @react="handlers.reaction"
              @reply="handlers.reply"
              @renote="handlers.renote"
              @quote="handlers.quote"
              @delete="removeNote"
              @edit="handlers.edit"
              @bookmark="handlers.bookmark"
              @delete-and-edit="handlers.deleteAndEdit"
            />
          </div>
        </template>

        <template #append>
          <div v-if="isLoading && notes.length > 0" :class="$style.loadingMore">
            Loading...
          </div>
        </template>
      </NoteScroller>
    </div>
  </DeckColumn>

  <!-- Single-account mode -->
  <DeckNoteColumn
    v-else
    :column="column"
    title="ダイレクト"
    icon="ti-mail"
    sound-enabled
    :note-column-config="noteColumnConfig"
  />
</template>

<style lang="scss" module>
@use './column-common.module.scss';
</style>
