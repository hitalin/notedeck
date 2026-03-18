<script setup lang="ts">
import type { Component } from 'vue'
import { computed, defineAsyncComponent, onMounted, provide, ref } from 'vue'
import { useRoute } from 'vue-router'
import AddColumnDialog from '@/components/deck/AddColumnDialog.vue'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'

const route = useRoute()

const COLUMN_COMPONENTS: Record<string, Component> = {
  timeline: defineAsyncComponent(
    () => import('@/components/deck/DeckTimelineColumn.vue'),
  ),
  list: defineAsyncComponent(
    () => import('@/components/deck/DeckListColumn.vue'),
  ),
  antenna: defineAsyncComponent(
    () => import('@/components/deck/DeckAntennaColumn.vue'),
  ),
  notifications: defineAsyncComponent(
    () => import('@/components/deck/DeckNotificationColumn.vue'),
  ),
  search: defineAsyncComponent(
    () => import('@/components/deck/DeckSearchColumn.vue'),
  ),
  favorites: defineAsyncComponent(
    () => import('@/components/deck/DeckFavoritesColumn.vue'),
  ),
  clip: defineAsyncComponent(
    () => import('@/components/deck/DeckClipColumn.vue'),
  ),
  channel: defineAsyncComponent(
    () => import('@/components/deck/DeckChannelColumn.vue'),
  ),
  user: defineAsyncComponent(
    () => import('@/components/deck/DeckUserColumn.vue'),
  ),
  mentions: defineAsyncComponent(
    () => import('@/components/deck/DeckMentionsColumn.vue'),
  ),
  specified: defineAsyncComponent(
    () => import('@/components/deck/DeckSpecifiedColumn.vue'),
  ),
  chat: defineAsyncComponent(
    () => import('@/components/deck/DeckChatColumn.vue'),
  ),
  widget: defineAsyncComponent(
    () => import('@/components/deck/DeckWidgetColumn.vue'),
  ),
  aiscript: defineAsyncComponent(
    () => import('@/components/deck/DeckAiScriptColumn.vue'),
  ),
  play: defineAsyncComponent(
    () => import('@/components/deck/DeckPlayColumn.vue'),
  ),
  page: defineAsyncComponent(
    () => import('@/components/deck/DeckPageColumn.vue'),
  ),
  ai: defineAsyncComponent(() => import('@/components/deck/DeckAiColumn.vue')),
  drive: defineAsyncComponent(
    () => import('@/components/deck/DeckDriveColumn.vue'),
  ),
  announcements: defineAsyncComponent(
    () => import('@/components/deck/DeckAnnouncementsColumn.vue'),
  ),
  gallery: defineAsyncComponent(
    () => import('@/components/deck/DeckGalleryColumn.vue'),
  ),
  explore: defineAsyncComponent(
    () => import('@/components/deck/DeckExploreColumn.vue'),
  ),
  followRequests: defineAsyncComponent(
    () => import('@/components/deck/DeckFollowRequestsColumn.vue'),
  ),
  achievements: defineAsyncComponent(
    () => import('@/components/deck/DeckAchievementsColumn.vue'),
  ),
  apiConsole: defineAsyncComponent(
    () => import('@/components/deck/DeckApiConsoleColumn.vue'),
  ),
  apiDocs: defineAsyncComponent(
    () => import('@/components/deck/DeckApiDocsColumn.vue'),
  ),
  lookup: defineAsyncComponent(
    () => import('@/components/deck/DeckLookupColumn.vue'),
  ),
  serverInfo: defineAsyncComponent(
    () => import('@/components/deck/DeckServerInfoColumn.vue'),
  ),
  ads: defineAsyncComponent(
    () => import('@/components/deck/DeckAdsColumn.vue'),
  ),
  aboutMisskey: defineAsyncComponent(
    () => import('@/components/deck/DeckAboutMisskeyColumn.vue'),
  ),
  emoji: defineAsyncComponent(
    () => import('@/components/deck/DeckEmojiColumn.vue'),
  ),
  themeEditor: defineAsyncComponent(
    () => import('@/components/deck/DeckThemeEditorColumn.vue'),
  ),
  cssEditor: defineAsyncComponent(
    () => import('@/components/deck/DeckCssEditorColumn.vue'),
  ),
}

let pipColumnCounter = 0
function genPipColumnId(): string {
  return `pip-${Date.now()}-${++pipColumnCounter}`
}

const accountsStore = useAccountsStore()
const themeStore = useThemeStore()

const selectedColumn = ref<DeckColumn | null>(null)
const themeVars = computed(() => {
  const accountId = selectedColumn.value?.accountId
  if (!accountId) return undefined
  return themeStore.getStyleVarsForAccount(accountId)
})

function onColumnSelected(config: Omit<DeckColumn, 'id'>) {
  const column: DeckColumn = { ...config, id: genPipColumnId() }
  selectedColumn.value = column
}

// Provide column config getter for DeckColumn's "return to deck" feature
provide('pipColumnConfig', () => selectedColumn.value)

async function closeWindow() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().close()
}

/** Parse column config from URL query param (base64-encoded JSON) */
function parseColumnFromUrl(): Omit<DeckColumn, 'id'> | null {
  const encoded = route.query.col as string | undefined
  if (!encoded) return null
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)))
  } catch {
    return null
  }
}

onMounted(async () => {
  if (!accountsStore.isLoaded) {
    await accountsStore.loadAccounts()
  }

  // If column config is provided via URL, render it immediately
  const urlConfig = parseColumnFromUrl()
  if (urlConfig) {
    onColumnSelected(urlConfig)
  }
})
</script>

<template>
  <div :class="$style.pipRoot" :style="themeVars">
    <!-- Column selector -->
    <template v-if="!selectedColumn">
      <!-- Drag bar for selector state -->
      <div :class="$style.pipDragBar" data-tauri-drag-region>
        <span :class="$style.pipDragTitle" data-tauri-drag-region>カラムを追加</span>
        <button :class="$style.pipDragClose" @click="closeWindow">
          <i class="ti ti-x" />
        </button>
      </div>
      <div :class="$style.pipSelectorBody">
        <AddColumnDialog
          mode="pip"
          @column-selected="onColumnSelected"
          @close="closeWindow"
        />
      </div>
    </template>

    <!-- Render the selected column -->
    <template v-else>
      <component
        :is="COLUMN_COMPONENTS[selectedColumn.type]"
        :column="selectedColumn"
      />
    </template>
  </div>
</template>

<style lang="scss" module>
.pipRoot {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--nd-bg);
  color: var(--nd-fg);
  overflow: hidden;
  border-radius: 10px;
}

.pipDragBar {
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 8px 0 16px;
  background: var(--nd-panelHeaderBg);
  color: var(--nd-panelHeaderFg);
  user-select: none;
  flex-shrink: 0;
  border-radius: 10px 10px 0 0;
}

.pipDragTitle {
  flex: 1;
  font-size: 0.85em;
  font-weight: bold;
}

.pipDragClose {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--nd-panelHeaderFg);
  border-radius: var(--nd-radius-sm);
  opacity: 0.35;
  cursor: pointer;

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 0.8;
  }
}

.pipSelectorBody {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
