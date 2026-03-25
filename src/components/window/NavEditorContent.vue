<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ColumnType } from '@/stores/deck'
import { DEFAULT_NAV_ITEMS, useDeckStore } from '@/stores/deck'

const deckStore = useDeckStore()

interface NavItemDef {
  type: ColumnType
  icon: string
  label: string
}

const ALL_NAV_OPTIONS: NavItemDef[] = [
  { type: 'notifications', icon: 'ti-bell', label: '通知' },
  { type: 'chat', icon: 'ti-messages', label: 'チャット' },
  { type: 'search', icon: 'ti-search', label: '検索' },
  { type: 'ai', icon: 'ti-sparkles', label: 'AI' },
  { type: 'timeline', icon: 'ti-home', label: 'タイムライン' },
  { type: 'mentions', icon: 'ti-at', label: 'メンション' },
  { type: 'favorites', icon: 'ti-star', label: 'お気に入り' },
  { type: 'drive', icon: 'ti-cloud', label: 'ドライブ' },
  { type: 'explore', icon: 'ti-compass', label: 'みつける' },
  { type: 'announcements', icon: 'ti-speakerphone', label: 'お知らせ' },
  { type: 'gallery', icon: 'ti-photo', label: 'ギャラリー' },
  { type: 'followRequests', icon: 'ti-user-plus', label: 'フォローリクエスト' },
]

const NAV_ITEM_MAP = new Map(ALL_NAV_OPTIONS.map((o) => [o.type, o]))

const items = ref<ColumnType[]>([...deckStore.navItems])

watch(items, (v) => deckStore.setNavItems(v), { deep: true })

const draggingIndex = ref<number | null>(null)

function onDragStart(index: number, e: DragEvent) {
  draggingIndex.value = index
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(index: number, e: DragEvent) {
  e.preventDefault()
  if (draggingIndex.value === null || draggingIndex.value === index) return
  const moved = items.value.splice(draggingIndex.value, 1)[0]
  if (!moved) return
  items.value.splice(index, 0, moved)
  draggingIndex.value = index
}

function onDragEnd() {
  draggingIndex.value = null
}

function removeItem(index: number) {
  items.value.splice(index, 1)
}

function addItem(type: ColumnType) {
  if (!items.value.includes(type)) {
    items.value.push(type)
  }
}

function resetToDefault() {
  items.value = [...DEFAULT_NAV_ITEMS]
}

function getItemDef(type: ColumnType): NavItemDef {
  return NAV_ITEM_MAP.get(type) ?? { type, icon: 'ti-layout-grid', label: type }
}

const availableItems = ref<NavItemDef[]>([])
const showAddMenu = ref(false)

function toggleAddMenu() {
  availableItems.value = ALL_NAV_OPTIONS.filter(
    (o) => !items.value.includes(o.type),
  )
  showAddMenu.value = !showAddMenu.value
}
</script>

<template>
  <div :class="$style.root">
    <div :class="$style.header">ナビバーの項目</div>

    <div :class="$style.list">
      <div
        v-for="(type, i) in items"
        :key="type"
        :class="[$style.item, draggingIndex === i && $style.dragging]"
        draggable="true"
        @dragstart="onDragStart(i, $event)"
        @dragover="onDragOver(i, $event)"
        @dragend="onDragEnd"
      >
        <i class="ti ti-grip-vertical" :class="$style.grip" />
        <i :class="['ti', getItemDef(type).icon, $style.icon]" />
        <span :class="$style.label">{{ getItemDef(type).label }}</span>
        <button class="_button" :class="$style.removeBtn" @click="removeItem(i)">
          <i class="ti ti-x" />
        </button>
      </div>
      <div v-if="items.length === 0" :class="$style.empty">項目がありません</div>
    </div>

    <div :class="$style.actions">
      <div :class="$style.addWrap">
        <button class="_button" :class="$style.addBtn" @click="toggleAddMenu">
          <i class="ti ti-plus" />
          <span>項目を追加</span>
        </button>
        <div v-if="showAddMenu" :class="$style.addMenu">
          <button
            v-for="opt in availableItems"
            :key="opt.type"
            class="_button"
            :class="$style.addMenuItem"
            @click="addItem(opt.type); showAddMenu = false"
          >
            <i :class="['ti', opt.icon]" />
            <span>{{ opt.label }}</span>
          </button>
          <div v-if="availableItems.length === 0" :class="$style.empty">
            すべての項目が追加済みです
          </div>
        </div>
      </div>
      <button class="_button" :class="$style.resetBtn" @click="resetToDefault">
        デフォルトに戻す
      </button>
    </div>
  </div>
</template>

<style lang="scss" module>
.root {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
}

.header {
  font-weight: bold;
  font-size: 0.95em;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--nd-radius);
  background: var(--nd-panelHighlight);
  cursor: grab;
  transition: opacity 0.15s;

  &.dragging {
    opacity: 0.4;
  }
}

.grip {
  color: var(--nd-fgTransparent);
  cursor: grab;
}

.icon {
  font-size: 1.2em;
  opacity: 0.8;
}

.label {
  flex: 1;
  font-size: 0.9em;
}

.removeBtn {
  padding: 4px;
  border-radius: var(--nd-radius);
  color: var(--nd-fgTransparent);
  transition: color 0.15s, background 0.15s;

  &:hover {
    color: var(--nd-error);
    background: color-mix(in srgb, var(--nd-error) 10%, transparent);
  }
}

.empty {
  padding: 12px;
  text-align: center;
  color: var(--nd-fgTransparent);
  font-size: 0.85em;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.addWrap {
  position: relative;
}

.addBtn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  width: 100%;
  border-radius: var(--nd-radius);
  color: var(--nd-accent);
  font-size: 0.9em;

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.addMenu {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  max-height: 200px;
  overflow-y: auto;
  background: var(--nd-panel);
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius);
  box-shadow: 0 -4px 16px rgb(0 0 0 / 0.15);
  z-index: 10;
  margin-bottom: 4px;
}

.addMenuItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  width: 100%;
  font-size: 0.9em;

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.resetBtn {
  padding: 6px 12px;
  border-radius: var(--nd-radius);
  color: var(--nd-fgTransparent);
  font-size: 0.85em;
  text-align: center;

  &:hover {
    background: var(--nd-buttonHoverBg);
    color: var(--nd-fg);
  }
}
</style>
