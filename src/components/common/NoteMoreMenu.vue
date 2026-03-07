<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, ref, watch } from 'vue'
import type { NormalizedNote } from '@/adapters/types'
import {
  getPluginHandlers,
  setPluginAccountContext,
} from '@/aiscript/plugin-api'
import { isSafeUrl } from '@/utils/url'

const props = defineProps<{
  note: NormalizedNote
  isOwnNote: boolean
  isFavorited: boolean
  isPinned: boolean
}>()

const emit = defineEmits<{
  delete: [note: NormalizedNote]
  edit: [note: NormalizedNote]
  bookmark: [note: NormalizedNote]
  pin: [note: NormalizedNote]
}>()

const showMenu = ref(false)
const showDeleteConfirm = ref(false)
const menuPos = ref({ x: 0, y: 0 })
const localIsFavorited = ref(props.isFavorited)
const localIsPinned = ref(props.isPinned)

watch(
  () => props.isFavorited,
  (v) => {
    localIsFavorited.value = v
  },
)

watch(
  () => props.isPinned,
  (v) => {
    localIsPinned.value = v
  },
)

const noteActions = computed(() => getPluginHandlers('note_action'))

const noteWebUrl = computed(() => {
  const n = props.note
  return n.url ?? n.uri ?? `https://${n._serverHost}/notes/${n.id}`
})

function open(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  let x = rect.left
  let y = rect.bottom + 4
  // 画面外に出ないよう調整
  const menuWidth = 250
  const menuHeight = 300
  if (x + menuWidth > window.innerWidth) {
    x = window.innerWidth - menuWidth - 8
  }
  if (y + menuHeight > window.innerHeight) {
    y = rect.top - menuHeight - 4
  }
  x = Math.max(8, x)
  y = Math.max(8, y)
  menuPos.value = { x, y }
  showMenu.value = true
}

function close() {
  showMenu.value = false
  showDeleteConfirm.value = false
}

function openInWebUI() {
  const url = noteWebUrl.value
  if (url && isSafeUrl(url)) openUrl(url)
}

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <Transition name="nd-popup">
      <div v-if="showMenu" class="popup-backdrop" @click="close">
        <div
          class="popup-menu"
          :style="{ top: menuPos.y + 'px', left: menuPos.x + 'px' }"
          @click.stop
        >
          <template v-if="showDeleteConfirm">
            <div class="popup-confirm-text">このノートを削除しますか？</div>
            <button class="popup-item popup-item-danger" @click="emit('delete', note); close()">
              <i class="ti ti-trash" />
              削除
            </button>
            <button class="popup-item" @click="showDeleteConfirm = false">
              <i class="ti ti-x" />
              キャンセル
            </button>
          </template>
          <template v-else>
            <button
              class="popup-item"
              :class="{ 'popup-item-active': localIsFavorited }"
              @click="localIsFavorited = !localIsFavorited; emit('bookmark', note); close()"
            >
              <i :class="localIsFavorited ? 'ti ti-star-filled' : 'ti ti-star'" />
              {{ localIsFavorited ? 'お気に入り解除' : 'お気に入り' }}
            </button>
            <button class="popup-item" @click="openInWebUI(); close()">
              <i class="ti ti-external-link" />
              Web UIで開く
            </button>
            <template v-if="noteActions.length > 0">
              <div class="popup-divider" />
              <button
                v-for="action in noteActions"
                :key="action.pluginInstallId + action.title"
                class="popup-item"
                @click="setPluginAccountContext(action.pluginInstallId, note._accountId); action.handler(note); close()"
              >
                <i class="ti ti-plug" />
                {{ action.title }}
              </button>
            </template>
            <template v-if="isOwnNote">
              <div class="popup-divider" />
              <button
                class="popup-item"
                :class="{ 'popup-item-active': localIsPinned }"
                @click="localIsPinned = !localIsPinned; emit('pin', note); close()"
              >
                <i :class="localIsPinned ? 'ti ti-pinned-off' : 'ti ti-pin'" />
                {{ localIsPinned ? 'ピン留め解除' : 'ピン留め' }}
              </button>
              <button class="popup-item" @click="emit('edit', note); close()">
                <i class="ti ti-edit" />
                編集
              </button>
              <button class="popup-item popup-item-danger" @click="showDeleteConfirm = true">
                <i class="ti ti-trash" />
                削除
              </button>
            </template>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.popup-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: transparent;
}

.popup-menu {
  position: fixed;
  min-width: 200px;
  max-width: 300px;
  padding: 6px;
  background: color-mix(in srgb, var(--nd-popup, var(--nd-panel)) 85%, transparent);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(16px);
  z-index: 10001;
}

.popup-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 12px;
  min-height: 44px;
  border: none;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  color: var(--nd-fg);
  font-size: 0.9em;
  text-align: left;
  transition: background 0.15s;
}

.popup-item:hover {
  background: var(--nd-buttonHoverBg);
}

.popup-item .ti {
  opacity: 0.7;
  flex-shrink: 0;
}

.popup-item-active {
  color: var(--nd-warn, #f0a020);
}

.popup-item-active .ti {
  opacity: 1;
}

.popup-item-danger {
  color: #ff2a2a;
}

.popup-divider {
  height: 1px;
  margin: 4px 0;
  background: var(--nd-divider);
}

.popup-confirm-text {
  padding: 9px 12px;
  font-size: 0.9em;
  font-weight: bold;
  color: var(--nd-fg);
}

.nd-popup-enter-active,
.nd-popup-leave-active {
  transition: opacity 0.15s ease;
}

.nd-popup-enter-active .popup-menu,
.nd-popup-leave-active .popup-menu {
  transition: opacity 0.2s cubic-bezier(0, 0, 0.2, 1), transform 0.2s cubic-bezier(0, 0, 0.2, 1);
}

.nd-popup-enter-from,
.nd-popup-leave-to {
  opacity: 0;
}

.nd-popup-enter-from .popup-menu,
.nd-popup-leave-to .popup-menu {
  transform: scale(0.95) translateY(-4px);
}
</style>
