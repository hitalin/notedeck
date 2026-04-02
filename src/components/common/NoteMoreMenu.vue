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
import { isSafeUrl } from '@/utils/url'
import PopupMenu from './PopupMenu.vue'

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

const popupMenuRef = ref<InstanceType<typeof PopupMenu>>()
const showDeleteConfirm = ref(false)
const showDeleteAndEditConfirm = ref(false)
const showClipList = ref(false)
const showMuteConfirm = ref(false)
const showReportForm = ref(false)
const reportComment = ref('')
const clips = ref<Clip[]>([])
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
  popupMenuRef.value?.open(e)
}

function close() {
  popupMenuRef.value?.close()
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

const canShare = typeof navigator.share === 'function'

async function shareNote() {
  const url = noteWebUrl.value
  try {
    await navigator.share({ url })
  } catch {
    // User cancelled or share failed — ignore
  }
  close()
}

async function copyAndClose(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
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
  <PopupMenu ref="popupMenuRef" @close="resetSubViews">
    <!-- Delete confirm -->
    <template v-if="currentView === 'deleteConfirm'">
      <div class="_popupConfirmText">このノートを削除しますか？</div>
      <button class="_popupItem _popupItemDanger" @click="emit('delete', note); close()">
        <i class="ti ti-trash" />
        削除
      </button>
      <button class="_popupItem" @click="backToMain">
        <i class="ti ti-x" />
        キャンセル
      </button>
    </template>

    <!-- Delete and edit confirm -->
    <template v-else-if="currentView === 'deleteAndEditConfirm'">
      <div class="_popupConfirmText">このノートを削除して再編集しますか？</div>
      <button class="_popupItem _popupItemDanger" @click="emit('deleteAndEdit', note); close()">
        <i class="ti ti-trash" />
        削除して編集
      </button>
      <button class="_popupItem" @click="backToMain">
        <i class="ti ti-x" />
        キャンセル
      </button>
    </template>

    <!-- Clip list -->
    <template v-else-if="currentView === 'clipList'">
      <button class="_popupItem" @click="backToMain">
        <i class="ti ti-arrow-left" />
        戻る
      </button>
      <div class="_popupDivider" />
      <template v-if="clips.length > 0">
        <button
          v-for="clip in clips"
          :key="clip.id"
          class="_popupItem"
          @click="addToClip(clip.id)"
        >
          <i class="ti ti-paperclip" />
          {{ clip.name }}
        </button>
      </template>
      <div v-else class="_popupConfirmText">クリップがありません</div>
    </template>

    <!-- Mute confirm -->
    <template v-else-if="currentView === 'muteConfirm'">
      <div class="_popupConfirmText">@{{ note.user.username }} をミュートしますか？</div>
      <button class="_popupItem _popupItemDanger" @click="muteUser">
        <i class="ti ti-eye-off" />
        ミュート
      </button>
      <button class="_popupItem" @click="backToMain">
        <i class="ti ti-x" />
        キャンセル
      </button>
    </template>

    <!-- Report form -->
    <template v-else-if="currentView === 'reportForm'">
      <div class="_popupConfirmText">@{{ note.user.username }} を通報</div>
      <div class="_popupReportInputWrap">
        <textarea
          v-model="reportComment"
          class="_popupReportInput"
          placeholder="通報理由を入力..."
          rows="3"
        />
      </div>
      <button
        class="_popupItem _popupItemDanger"
        :disabled="!reportComment.trim()"
        @click="submitReport"
      >
        <i class="ti ti-alert-triangle" />
        送信
      </button>
      <button class="_popupItem" @click="backToMain">
        <i class="ti ti-x" />
        キャンセル
      </button>
    </template>

    <!-- Main menu -->
    <template v-else>
      <button
        v-if="!isGuest"
        :class="['_popupItem', localIsFavorited && '_popupItemActive']"
        @click="canInteract ? (localIsFavorited = !localIsFavorited, emit('bookmark', note), close()) : (showLoginPrompt(), close())"
      >
        <i class="ti ti-star" />
        {{ localIsFavorited ? 'お気に入り解除' : 'お気に入り' }}
      </button>
      <button v-if="!isGuest" class="_popupItem" @click="canInteract ? openClipList() : (showLoginPrompt(), close())">
        <i class="ti ti-paperclip" />
        クリップに追加
      </button>
      <button class="_popupItem" @click="openInWebUI(); close()">
        <i class="ti ti-external-link" />
        Web UIで開く
      </button>
      <div class="_popupDivider" />
      <button v-if="note.text" class="_popupItem" @click="copyAndClose(note.text!)">
        <i class="ti ti-copy" />
        内容をコピー
      </button>
      <button class="_popupItem" @click="copyAndClose(noteWebUrl)">
        <i class="ti ti-link" />
        リンクをコピー
      </button>
      <button v-if="canShare" class="_popupItem" @click="shareNote">
        <i class="ti ti-share" />
        共有
      </button>
      <template v-if="noteActions.length > 0">
        <div class="_popupDivider" />
        <button
          v-for="action in noteActions"
          :key="action.pluginInstallId + action.title"
          class="_popupItem"
          @click="setPluginAccountContext(action.pluginInstallId, note._accountId); action.handler(note); close()"
        >
          <i class="ti ti-plug" />
          {{ action.title }}
        </button>
      </template>
      <template v-if="isOwnNote">
        <div class="_popupDivider" />
        <button
          :class="['_popupItem', localIsPinned && '_popupItemActive']"
          @click="localIsPinned = !localIsPinned; emit('pin', note); close()"
        >
          <i :class="localIsPinned ? 'ti ti-pinned-off' : 'ti ti-pin'" />
          {{ localIsPinned ? 'ピン留め解除' : 'ピン留め' }}
        </button>
        <button class="_popupItem" @click="emit('edit', note); close()">
          <i class="ti ti-edit" />
          編集
        </button>
        <button class="_popupItem" @click="showDeleteAndEditConfirm = true">
          <i class="ti ti-eraser" />
          削除して編集
        </button>
        <button class="_popupItem _popupItemDanger" @click="showDeleteConfirm = true">
          <i class="ti ti-trash" />
          削除
        </button>
      </template>
      <template v-if="!isOwnNote && !isGuest">
        <div class="_popupDivider" />
        <button class="_popupItem" @click="canInteract ? (showMuteConfirm = true) : (showLoginPrompt(), close())">
          <i class="ti ti-eye-off" />
          このユーザーをミュート
        </button>
        <button class="_popupItem _popupItemDanger" @click="canInteract ? (showReportForm = true) : (showLoginPrompt(), close())">
          <i class="ti ti-alert-triangle" />
          通報
        </button>
      </template>
    </template>
  </PopupMenu>
</template>
