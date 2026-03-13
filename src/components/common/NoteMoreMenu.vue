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
  let x = e.clientX
  let y = e.clientY
  // 画面外に出ないよう調整
  const menuWidth = 250
  const menuHeight = 300
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  if (x + menuWidth > vw) {
    x = vw - menuWidth - 8
  }
  if (y + menuHeight > vh) {
    y = Math.max(8, y - menuHeight)
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

async function copyAndClose(text: string) {
  await navigator.clipboard.writeText(text)
  close()
}

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <Transition name="nd-popup">
      <div v-if="showMenu" :class="$style.popupBackdrop" @click="close">
        <div
          :class="$style.popupMenu"
          class="_popup nd-popup-content popup-menu"
          :style="{ top: menuPos.y + 'px', left: menuPos.x + 'px' }"
          @click.stop
        >
          <template v-if="showDeleteConfirm">
            <div :class="$style.popupConfirmText">このノートを削除しますか？</div>
            <button :class="[$style.popupItem, $style.popupItemDanger]" @click="emit('delete', note); close()">
              <i class="ti ti-trash" />
              削除
            </button>
            <button :class="$style.popupItem" @click="showDeleteConfirm = false">
              <i class="ti ti-x" />
              キャンセル
            </button>
          </template>
          <template v-else>
            <button
              :class="[$style.popupItem, localIsFavorited && $style.popupItemActive]"
              @click="localIsFavorited = !localIsFavorited; emit('bookmark', note); close()"
            >
              <i class="ti ti-star" />
              {{ localIsFavorited ? 'お気に入り解除' : 'お気に入り' }}
            </button>
            <button :class="$style.popupItem" @click="openInWebUI(); close()">
              <i class="ti ti-external-link" />
              Web UIで開く
            </button>
            <div :class="$style.popupDivider" />
            <button v-if="note.text" :class="$style.popupItem" @click="copyAndClose(note.text!)">
              <i class="ti ti-copy" />
              内容をコピー
            </button>
            <button :class="$style.popupItem" @click="copyAndClose(noteWebUrl)">
              <i class="ti ti-link" />
              リンクをコピー
            </button>
            <template v-if="noteActions.length > 0">
              <div :class="$style.popupDivider" />
              <button
                v-for="action in noteActions"
                :key="action.pluginInstallId + action.title"
                :class="$style.popupItem"
                @click="setPluginAccountContext(action.pluginInstallId, note._accountId); action.handler(note); close()"
              >
                <i class="ti ti-plug" />
                {{ action.title }}
              </button>
            </template>
            <template v-if="isOwnNote">
              <div :class="$style.popupDivider" />
              <button
                :class="[$style.popupItem, localIsPinned && $style.popupItemActive]"
                @click="localIsPinned = !localIsPinned; emit('pin', note); close()"
              >
                <i :class="localIsPinned ? 'ti ti-pinned-off' : 'ti ti-pin'" />
                {{ localIsPinned ? 'ピン留め解除' : 'ピン留め' }}
              </button>
              <button :class="$style.popupItem" @click="emit('edit', note); close()">
                <i class="ti ti-edit" />
                編集
              </button>
              <button :class="[$style.popupItem, $style.popupItemDanger]" @click="showDeleteConfirm = true">
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

<style lang="scss" module>
.popupBackdrop {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup);
  background: transparent;
}

.popupMenu {
  position: fixed;
  min-width: 200px;
  max-width: 300px;
  padding: 6px 0;
  z-index: calc(var(--nd-z-popup) + 1);
}

.popupItem {
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
  }

  :global(.ti) {
    opacity: 0.8;
    flex-shrink: 0;
    width: 1em;
    text-align: center;
  }
}

.popupItemActive {
  color: var(--nd-warn, #f0a020);

  :global(.ti) {
    opacity: 1;
  }
}

.popupItemDanger {
  color: var(--nd-error);
}

.popupDivider {
  height: 1px;
  margin: 4px 0;
  background: var(--nd-divider);
}

.popupConfirmText {
  padding: 7px 22px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fg);
}
</style>

<style>
/* Override default nd-popup transform */
.nd-popup-enter-from .popup-menu,
.nd-popup-leave-to .popup-menu {
  transform: scale(0.95) translateY(-4px);
}
</style>
