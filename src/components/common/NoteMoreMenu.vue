<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, ref, watch } from 'vue'
import type { Clip, NormalizedNote } from '@/adapters/types'
import {
  getPluginHandlers,
  setPluginAccountContext,
} from '@/aiscript/plugin-api'
import { useAccountMode } from '@/composables/useAccountMode'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useToast } from '@/stores/toast'
import { showLoginPrompt } from '@/utils/loginPrompt'
import { extractThemeVars } from '@/utils/themeVars'
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
  deleteAndEdit: [note: NormalizedNote]
}>()

const toast = useToast()
const { getOrCreate } = useMultiAccountAdapters()
const { canInteract, isGuest } = useAccountMode(() => props.note._accountId)

const showMenu = ref(false)
const showDeleteConfirm = ref(false)
const showDeleteAndEditConfirm = ref(false)
const showClipList = ref(false)
const showMuteConfirm = ref(false)
const showReportForm = ref(false)
const reportComment = ref('')
const clips = ref<Clip[]>([])
const menuPos = ref({ x: 0, y: 0 })
const menuTheme = ref<Record<string, string>>({})
const localIsFavorited = ref(props.isFavorited)
const localIsPinned = ref(props.isPinned)

type MenuView =
  | 'main'
  | 'deleteConfirm'
  | 'deleteAndEditConfirm'
  | 'clipList'
  | 'muteConfirm'
  | 'reportForm'

const currentView = computed<MenuView>(() => {
  if (showDeleteConfirm.value) return 'deleteConfirm'
  if (showDeleteAndEditConfirm.value) return 'deleteAndEditConfirm'
  if (showClipList.value) return 'clipList'
  if (showMuteConfirm.value) return 'muteConfirm'
  if (showReportForm.value) return 'reportForm'
  return 'main'
})

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
  const el = e.currentTarget as HTMLElement | null
  const column = (el ?? (e.target as HTMLElement))?.closest(
    '.deck-column',
  ) as HTMLElement | null
  if (column) menuTheme.value = extractThemeVars(column)
  let x = e.clientX
  let y = e.clientY
  const menuWidth = 250
  const menuHeight = 400
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
  resetSubViews()
}

function resetSubViews() {
  showDeleteConfirm.value = false
  showDeleteAndEditConfirm.value = false
  showClipList.value = false
  showMuteConfirm.value = false
  showReportForm.value = false
  reportComment.value = ''
}

function backToMain() {
  resetSubViews()
}

function openInWebUI() {
  const url = noteWebUrl.value
  if (url && isSafeUrl(url)) openUrl(url)
}

async function copyAndClose(text: string) {
  await navigator.clipboard.writeText(text)
  close()
}

async function openClipList() {
  try {
    const adapter = await getOrCreate(props.note._accountId)
    if (!adapter) return
    clips.value = await adapter.api.getClips()
    showClipList.value = true
  } catch {
    toast.show('クリップの取得に失敗しました', 'error')
  }
}

async function addToClip(clipId: string) {
  try {
    const adapter = await getOrCreate(props.note._accountId)
    if (!adapter) return
    await adapter.api.addNoteToClip(clipId, props.note.id)
    toast.show('クリップに追加しました')
    close()
  } catch {
    toast.show('クリップへの追加に失敗しました', 'error')
  }
}

async function muteUser() {
  try {
    const adapter = await getOrCreate(props.note._accountId)
    if (!adapter) return
    await adapter.api.muteUser(props.note.user.id)
    toast.show('ミュートしました')
    close()
  } catch {
    toast.show('ミュートに失敗しました', 'error')
  }
}

async function submitReport() {
  if (!reportComment.value.trim()) return
  try {
    const adapter = await getOrCreate(props.note._accountId)
    if (!adapter) return
    await adapter.api.reportUser(props.note.user.id, reportComment.value)
    toast.show('通報しました')
    close()
  } catch {
    toast.show('通報に失敗しました', 'error')
  }
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
          :style="{ ...menuTheme, top: menuPos.y + 'px', left: menuPos.x + 'px' }"
          @click.stop
        >
          <!-- Delete confirm -->
          <template v-if="currentView === 'deleteConfirm'">
            <div :class="$style.popupConfirmText">このノートを削除しますか？</div>
            <button :class="[$style.popupItem, $style.popupItemDanger]" @click="emit('delete', note); close()">
              <i class="ti ti-trash" />
              削除
            </button>
            <button :class="$style.popupItem" @click="backToMain">
              <i class="ti ti-x" />
              キャンセル
            </button>
          </template>

          <!-- Delete and edit confirm -->
          <template v-else-if="currentView === 'deleteAndEditConfirm'">
            <div :class="$style.popupConfirmText">このノートを削除して再編集しますか？</div>
            <button :class="[$style.popupItem, $style.popupItemDanger]" @click="emit('deleteAndEdit', note); close()">
              <i class="ti ti-trash" />
              削除して編集
            </button>
            <button :class="$style.popupItem" @click="backToMain">
              <i class="ti ti-x" />
              キャンセル
            </button>
          </template>

          <!-- Clip list -->
          <template v-else-if="currentView === 'clipList'">
            <button :class="$style.popupItem" @click="backToMain">
              <i class="ti ti-arrow-left" />
              戻る
            </button>
            <div :class="$style.popupDivider" />
            <template v-if="clips.length > 0">
              <button
                v-for="clip in clips"
                :key="clip.id"
                :class="$style.popupItem"
                @click="addToClip(clip.id)"
              >
                <i class="ti ti-paperclip" />
                {{ clip.name }}
              </button>
            </template>
            <div v-else :class="$style.popupConfirmText">クリップがありません</div>
          </template>

          <!-- Mute confirm -->
          <template v-else-if="currentView === 'muteConfirm'">
            <div :class="$style.popupConfirmText">@{{ note.user.username }} をミュートしますか？</div>
            <button :class="[$style.popupItem, $style.popupItemDanger]" @click="muteUser">
              <i class="ti ti-eye-off" />
              ミュート
            </button>
            <button :class="$style.popupItem" @click="backToMain">
              <i class="ti ti-x" />
              キャンセル
            </button>
          </template>

          <!-- Report form -->
          <template v-else-if="currentView === 'reportForm'">
            <div :class="$style.popupConfirmText">@{{ note.user.username }} を通報</div>
            <div :class="$style.reportInputWrap">
              <textarea
                v-model="reportComment"
                :class="$style.reportInput"
                placeholder="通報理由を入力..."
                rows="3"
              />
            </div>
            <button
              :class="[$style.popupItem, $style.popupItemDanger]"
              :disabled="!reportComment.trim()"
              @click="submitReport"
            >
              <i class="ti ti-alert-triangle" />
              送信
            </button>
            <button :class="$style.popupItem" @click="backToMain">
              <i class="ti ti-x" />
              キャンセル
            </button>
          </template>

          <!-- Main menu -->
          <template v-else>
            <button
              :class="[$style.popupItem, localIsFavorited && $style.popupItemActive, { [$style.popupItemDisabled]: isGuest }]"
              :disabled="isGuest"
              @click="canInteract ? (localIsFavorited = !localIsFavorited, emit('bookmark', note), close()) : (showLoginPrompt(), close())"
            >
              <i class="ti ti-star" />
              {{ localIsFavorited ? 'お気に入り解除' : 'お気に入り' }}
            </button>
            <button :class="[$style.popupItem, { [$style.popupItemDisabled]: isGuest }]" :disabled="isGuest" @click="canInteract ? openClipList() : (showLoginPrompt(), close())">
              <i class="ti ti-paperclip" />
              クリップに追加
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
              <button :class="$style.popupItem" @click="showDeleteAndEditConfirm = true">
                <i class="ti ti-eraser" />
                削除して編集
              </button>
              <button :class="[$style.popupItem, $style.popupItemDanger]" @click="showDeleteConfirm = true">
                <i class="ti ti-trash" />
                削除
              </button>
            </template>
            <template v-if="!isOwnNote">
              <div :class="$style.popupDivider" />
              <button :class="[$style.popupItem, { [$style.popupItemDisabled]: isGuest }]" :disabled="isGuest" @click="canInteract ? (showMuteConfirm = true) : (showLoginPrompt(), close())">
                <i class="ti ti-eye-off" />
                このユーザーをミュート
              </button>
              <button :class="[$style.popupItem, $style.popupItemDanger, { [$style.popupItemDisabled]: isGuest }]" :disabled="isGuest" @click="canInteract ? (showReportForm = true) : (showLoginPrompt(), close())">
                <i class="ti ti-alert-triangle" />
                通報
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

  &:disabled {
    opacity: 0.5;
    cursor: default;
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

.popupItemDisabled {
  opacity: 0.4;
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

.reportInputWrap {
  padding: 4px 16px;
}

.reportInput {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--nd-divider);
  border-radius: 6px;
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.85em;
  resize: vertical;

  &::placeholder {
    color: var(--nd-fgTransparent);
  }
}
</style>

<style>
/* Override default nd-popup transform */
.nd-popup-enter-from .popup-menu,
.nd-popup-leave-to .popup-menu {
  transform: scale(0.95) translateY(-4px);
}
</style>
