<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import DeckColumn from './DeckColumn.vue'
import MkNote from '@/components/common/MkNote.vue'
import { createAdapter } from '@/adapters/registry'
import type {
  ChannelSubscription,
  NormalizedNote,
  ServerAdapter,
  TimelineType,
} from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'
import { useEmojisStore } from '@/stores/emojis'
import { useServersStore } from '@/stores/servers'
import { useThemeStore } from '@/stores/theme'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'

const props = defineProps<{
  column: DeckColumnType
}>()

const accountsStore = useAccountsStore()
const deckStore = useDeckStore()
const emojisStore = useEmojisStore()
const serversStore = useServersStore()
const themeStore = useThemeStore()

const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === props.column.accountId),
)

const columnThemeVars = computed(() => {
  if (!props.column.accountId) return undefined
  const compiled = themeStore.getCompiledForAccount(props.column.accountId)
  if (!compiled) return undefined
  const style: Record<string, string> = {}
  for (const [key, value] of Object.entries(compiled)) {
    style[`--nd-${key}`] = value
  }
  return style
})

const notes = ref<NormalizedNote[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)
const tlType = ref<TimelineType>(props.column.tl || 'home')

let adapter: ServerAdapter | null = null
let subscription: ChannelSubscription | null = null

const TL_TYPES: { value: TimelineType; label: string; icon: string }[] = [
  { value: 'home', label: 'Home', icon: '🏠' },
  { value: 'local', label: 'Local', icon: '👥' },
  { value: 'social', label: 'Social', icon: '🌐' },
  { value: 'global', label: 'Global', icon: '🌍' },
]

function columnTitle(): string {
  const opt = TL_TYPES.find((o) => o.value === tlType.value) || TL_TYPES[0]
  return `${opt.label} - ${account.value?.host || '?'}`
}

function columnIcon(): string {
  const opt = TL_TYPES.find((o) => o.value === tlType.value) || TL_TYPES[0]
  return opt.icon
}

async function connect() {
  const acc = account.value
  if (!acc) return
  error.value = null
  isLoading.value = true

  try {
    const serverInfo = await serversStore.getServerInfo(acc.host)
    adapter = createAdapter(serverInfo, acc.token, acc.id)

    // Fetch server emojis once per host
    if (!emojisStore.has(acc.host)) {
      adapter.api.getServerEmojis().then((emojis) => {
        emojisStore.set(acc.host, emojis)
      }).catch(() => {})
    }

    const fetched = await adapter.api.getTimeline(tlType.value)
    notes.value = fetched

    adapter.stream.connect()
    subscription = adapter.stream.subscribeTimeline(
      tlType.value,
      (note: NormalizedNote) => {
        notes.value = [note, ...notes.value]
      },
    )
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isLoading.value = false
  }
}

function disconnect() {
  subscription?.dispose()
  subscription = null
  adapter?.stream.disconnect()
  adapter = null
}

async function switchTl(type: TimelineType) {
  if (type === tlType.value) return
  disconnect()
  notes.value = []
  tlType.value = type
  deckStore.updateColumn(props.column.id, { tl: type })
  await connect()
}

async function loadMore() {
  if (!adapter || isLoading.value || notes.value.length === 0) return
  const lastNote = notes.value[notes.value.length - 1]
  isLoading.value = true
  try {
    const older = await adapter.api.getTimeline(tlType.value, {
      untilId: lastNote.id,
    })
    notes.value = [...notes.value, ...older]
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isLoading.value = false
  }
}

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
    loadMore()
  }
}

onMounted(() => {
  connect()
})

onUnmounted(() => {
  disconnect()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="columnTitle()"
    :icon="columnIcon()"
    :theme-vars="columnThemeVars"
  >
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
          {{ opt.icon }}
        </button>
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="error" class="column-empty column-error">
      {{ error }}
    </div>

    <div v-else class="tl-body" @scroll="onScroll">
      <div v-if="isLoading && notes.length === 0" class="column-empty">
        Loading...
      </div>

      <MkNote v-for="note in notes" :key="note.id" :note="note" />

      <div v-if="isLoading && notes.length > 0" class="loading-more">
        Loading...
      </div>
    </div>
  </DeckColumn>
</template>

<style scoped>
.tl-tabs {
  display: flex;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-panelHeaderBg);
}

.tl-tab {
  flex: 1;
  padding: 6px 0;
  text-align: center;
  font-size: 0.95em;
  opacity: 0.4;
  transition: opacity 0.15s, background 0.15s;
}

.tl-tab:hover {
  opacity: 0.7;
  background: var(--nd-buttonHoverBg);
}

.tl-tab.active {
  opacity: 1;
  box-shadow: inset 0 -2px 0 var(--nd-accent);
}

.tl-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
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

.loading-more {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
}
</style>
