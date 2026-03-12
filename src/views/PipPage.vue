<script setup lang="ts">
import { emit } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { createAdapter } from '@/adapters/registry'
import type {
  ChannelSubscription,
  NormalizedNote,
  NoteUpdateEvent,
  ServerAdapter,
  TimelineType,
} from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import { useAccountsStore } from '@/stores/accounts'
import { useEmojisStore } from '@/stores/emojis'
import { noteStore } from '@/stores/notes'
import { useServersStore } from '@/stores/servers'
import { useThemeStore } from '@/stores/theme'
import { formatTime } from '@/utils/formatTime'
import { sortByCreatedAtDesc } from '@/utils/sortNotes'

const MAX_NOTES = 30

const TL_TYPES: { type: TimelineType; icon: string; label: string }[] = [
  { type: 'home', icon: 'ti-home', label: 'Home' },
  { type: 'local', icon: 'ti-planet', label: 'Local' },
  { type: 'social', icon: 'ti-rocket', label: 'Social' },
  { type: 'global', icon: 'ti-whirl', label: 'Global' },
]

const route = useRoute()
const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const themeStore = useThemeStore()
const emojisStore = useEmojisStore()

const currentAccountId = ref(route.query.accountId as string)
const currentTimeline = ref<TimelineType>(
  (route.query.timeline as TimelineType) || 'home',
)
const showAccountMenu = ref(false)

const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === currentAccountId.value),
)
const themeVars = computed(() =>
  currentAccountId.value
    ? themeStore.getStyleVarsForAccount(currentAccountId.value)
    : undefined,
)

const notes = ref<NormalizedNote[]>([])
const noteIds = new Set<string>()
const serverIconUrl = ref<string | undefined>()
const serverIcons = ref<Map<string, string>>(new Map())
const error = ref<string | null>(null)
let subscription: ChannelSubscription | null = null
let adapter: ServerAdapter | null = null
let pendingNotes: NormalizedNote[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

async function startTimeline(tl: TimelineType) {
  const acc = account.value
  if (!acc) {
    error.value = 'アカウントが見つかりません'
    return
  }

  // Clean up previous subscription
  subscription?.dispose()
  subscription = null
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pendingNotes = []
  notes.value = []
  noteIds.clear()
  error.value = null
  currentTimeline.value = tl

  try {
    if (!adapter) {
      const serverInfo = await serversStore.getServerInfo(acc.host)
      serverIconUrl.value = serverInfo.iconUrl
      adapter = createAdapter(serverInfo, acc.id)
    }
    emojisStore.ensureLoaded(acc.host, () => adapter!.api.getServerEmojis())

    // Initial fetch
    const fetched = await adapter.api.getTimeline(tl, { limit: MAX_NOTES })
    noteStore.put(fetched)
    for (const n of fetched) noteIds.add(n.id)
    notes.value = fetched

    // Streaming (batched to avoid excessive re-renders)
    adapter.stream.connect()
    subscription = adapter.stream.subscribeTimeline(
      tl,
      (note: NormalizedNote) => {
        if (noteIds.has(note.id)) return
        noteStore.put([note])
        noteIds.add(note.id)
        pendingNotes.push(note)
        if (!flushTimer) {
          flushTimer = setTimeout(() => {
            flushTimer = null
            if (pendingNotes.length === 0) return
            const merged = sortByCreatedAtDesc([
              ...pendingNotes,
              ...notes.value,
            ])
            pendingNotes = []
            notes.value =
              merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
          }, 200)
        }
      },
      {
        onNoteUpdated: (event: NoteUpdateEvent) => {
          noteStore.applyUpdate(event, acc.userId)
        },
      },
    )
  } catch (e) {
    error.value = String(e)
  }
}

async function switchAccount(id: string) {
  if (id === currentAccountId.value) {
    showAccountMenu.value = false
    return
  }
  showAccountMenu.value = false
  subscription?.dispose()
  subscription = null
  adapter = null
  currentAccountId.value = id
  // Update server icon for new account
  const acc = accountsStore.accounts.find((a) => a.id === id)
  if (acc) {
    serverIconUrl.value = serverIcons.value.get(acc.host)
  }
  await startTimeline(currentTimeline.value)
}

function toggleAccountMenu() {
  if (accountsStore.accounts.length <= 1) return
  showAccountMenu.value = !showAccountMenu.value
}

function onNoteClick(note: NormalizedNote) {
  emit('pip:open-note', {
    accountId: currentAccountId.value,
    noteId: note.id,
  })
}

async function closeWindow() {
  const win = getCurrentWindow()
  await win.close()
}

async function loadServerIcons() {
  for (const acc of accountsStore.accounts) {
    if (serverIcons.value.has(acc.host)) continue
    try {
      const info = await serversStore.getServerInfo(acc.host)
      if (info.iconUrl) {
        serverIcons.value.set(acc.host, info.iconUrl)
      }
    } catch {
      // ignore
    }
  }
}

onMounted(async () => {
  if (!accountsStore.isLoaded) {
    await accountsStore.loadAccounts()
  }
  await loadServerIcons()
  await startTimeline(currentTimeline.value)
})

onUnmounted(() => {
  subscription?.dispose()
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
})
</script>

<template>
  <div class="pip-root" :style="themeVars">
    <!-- Column-style header -->
    <header class="column-header" data-tauri-drag-region>
      <div
        class="color-indicator"
        :style="{ background: 'var(--nd-accent)' }"
      />

      <!-- Current TL icon -->
      <i :class="'ti ' + TL_TYPES.find(t => t.type === currentTimeline)?.icon" class="tl-header-icon" data-tauri-drag-region />

      <span class="header-title" data-tauri-drag-region>{{ TL_TYPES.find(t => t.type === currentTimeline)?.label }}</span>

      <!-- Account indicator (matches main column header-meta) -->
      <button
        class="header-account"
        :class="{ clickable: accountsStore.accounts.length > 1 }"
        @click="toggleAccountMenu"
      >
        <img v-if="account?.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img
          class="header-favicon"
          :src="serverIconUrl || `https://${account?.host}/favicon.ico`"
          :title="account?.host"
        />
      </button>

      <!-- Close button (column header-btn style) -->
      <button class="header-btn" title="閉じる" @click="closeWindow">
        <i class="ti ti-x" />
      </button>
    </header>

    <!-- TL type tabs -->
    <nav class="pip-tabs">
      <button
        v-for="tl in TL_TYPES"
        :key="tl.type"
        class="pip-tab"
        :class="{ active: currentTimeline === tl.type }"
        :title="tl.label"
        @click="startTimeline(tl.type)"
      >
        <i :class="'ti ' + tl.icon" />
      </button>
    </nav>

    <!-- Timeline (relative container for account menu overlay) -->
    <div class="pip-body">
      <!-- Account switcher overlay -->
      <div v-if="showAccountMenu" class="pip-account-overlay" @click.self="showAccountMenu = false">
        <div class="pip-account-menu">
          <button
            v-for="acc in accountsStore.accounts"
            :key="acc.id"
            class="pip-account-item"
            :class="{ active: acc.id === currentAccountId }"
            @click="switchAccount(acc.id)"
          >
            <img v-if="acc.avatarUrl" :src="acc.avatarUrl" class="header-avatar" />
            <img
              class="header-favicon"
              :src="serverIcons.get(acc.host) || `https://${acc.host}/favicon.ico`"
            />
            <span class="pip-account-name">{{ acc.username }}</span>
            <span class="pip-account-host">@{{ acc.host }}</span>
          </button>
        </div>
      </div>

      <div class="pip-content">
        <div v-if="error" class="pip-error">{{ error }}</div>
        <div
          v-for="note in notes"
          :key="note.id"
          class="pip-note"
          @click="onNoteClick(note)"
        >
          <MkAvatar
            :avatar-url="(note.renote && note.text === null ? note.renote.user : note.user).avatarUrl"
            :size="28"
            class="pip-note-avatar"
          />
          <div class="pip-note-body">
            <div class="pip-note-header">
              <span class="pip-note-name">
                <MkMfm
                  v-if="(note.renote && note.text === null ? note.renote.user : note.user).name"
                  :text="(note.renote && note.text === null ? note.renote.user : note.user).name!"
                  :emojis="(note.renote && note.text === null ? note.renote.user : note.user).emojis"
                  :account-id="currentAccountId"
                  :server-host="account?.host"
                />
                <template v-else>{{ (note.renote && note.text === null ? note.renote.user : note.user).username }}</template>
              </span>
              <span class="pip-note-time">{{ formatTime(note.createdAt) }}</span>
            </div>
            <div class="pip-note-text">
              <MkMfm
                v-if="(note.renote && note.text === null ? note.renote.text : note.text)"
                :text="(note.renote && note.text === null ? note.renote.text : note.text)!"
                :emojis="(note.renote && note.text === null ? note.renote.emojis : note.emojis)"
                :account-id="currentAccountId"
                :server-host="account?.host"
              />
              <span v-else class="pip-note-empty">
                <i class="ti ti-repeat" /> Renote
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pip-root {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--nd-bg);
  color: var(--nd-fg);
  overflow: hidden;
  border-radius: 8px;
}

/* === Column header (unified with DeckColumn.vue) === */
.column-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  line-height: 38px;
  padding: 0 8px 0 30px;
  background: var(--nd-panelHeaderBg);
  color: var(--nd-panelHeaderFg);
  font-size: 0.9em;
  font-weight: bold;
  flex-shrink: 0;
  user-select: none;
  box-shadow: 0 0.5px 0 0 rgba(255, 255, 255, 0.07);
}

.color-indicator {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 5px;
  height: calc(100% - 24px);
  border-radius: 999px;
}

.tl-header-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.header-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85em;
}

.header-account {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 2px;
  border-radius: 4px;
  cursor: default;
}

.header-account.clickable {
  cursor: pointer;
}

.header-account.clickable:hover {
  background: rgba(255, 255, 255, 0.1);
}

.header-avatar {
  width: 18px;
  height: 18px;
  max-width: 18px;
  max-height: 18px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
}

.header-favicon {
  width: 16px;
  height: 16px;
  max-width: 16px;
  max-height: 16px;
  flex-shrink: 0;
  object-fit: contain;
  opacity: 0.7;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--nd-panelHeaderFg);
  border-radius: 6px;
  flex-shrink: 0;
  opacity: 0.35;
  cursor: pointer;
}

.header-btn:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 0.8;
}

/* === TL tabs === */
.pip-tabs {
  display: flex;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-panelBg);
  flex-shrink: 0;
}

.pip-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 26px;
  border: none;
  background: none;
  color: var(--nd-fg);
  opacity: 0.35;
  cursor: pointer;
  font-size: 13px;
  transition: opacity 0.15s, background 0.15s;
}

.pip-tab:hover {
  opacity: 0.7;
  background: var(--nd-buttonHoverBg);
}

.pip-tab.active {
  opacity: 1;
  border-bottom: 2px solid var(--nd-accent);
}

/* === Body (relative for overlay) === */
.pip-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Account switcher overlay */
.pip-account-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.3);
}

.pip-account-menu {
  background: var(--nd-panel);
  border-bottom: 1px solid var(--nd-divider);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.pip-account-item {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: none;
  color: var(--nd-fg);
  font-size: 0.75em;
  cursor: pointer;
  transition: background 0.1s;
}

.pip-account-item:hover {
  background: var(--nd-buttonHoverBg);
}

.pip-account-item.active {
  background: rgba(255, 255, 255, 0.05);
}

.pip-account-name {
  font-weight: 600;
}

.pip-account-host {
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* === Timeline content === */
.pip-content {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
}

.pip-error {
  padding: 16px;
  text-align: center;
  font-size: 0.8em;
  color: var(--nd-love);
}

.pip-note {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--nd-divider);
  cursor: pointer;
  transition: background 0.1s;
}

.pip-note:hover {
  background: var(--nd-buttonHoverBg);
}

.pip-note-avatar {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.pip-note-body {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.pip-note-header {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 1px;
}

.pip-note-name {
  font-size: 0.75em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pip-note-time {
  font-size: 0.65em;
  opacity: 0.4;
  flex-shrink: 0;
  margin-left: auto;
}

.pip-note-text {
  font-size: 0.8em;
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.pip-note-empty {
  opacity: 0.4;
  font-size: 0.85em;
}
</style>
