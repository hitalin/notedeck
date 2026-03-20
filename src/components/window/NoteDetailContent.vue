<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { initAdapterFor } from '@/adapters/initAdapter'
import type {
  NormalizedNote,
  NoteReaction,
  ServerAdapter,
} from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkEmoji from '@/components/common/MkEmoji.vue'
import MkNote from '@/components/common/MkNote.vue'
import type {
  NoteTreeHandlers,
  NoteTreeNode,
} from '@/components/common/MkNoteTree.vue'
import MkNoteTree from '@/components/common/MkNoteTree.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { useNavigation } from '@/composables/useNavigation'
import { useAccountsStore } from '@/stores/accounts'
import { useNoteStore } from '@/stores/notes'
import { useIsCompactLayout } from '@/stores/ui'
import { AppError } from '@/utils/errors'
import { proxyUrl } from '@/utils/imageProxy'
import { toggleReaction } from '@/utils/toggleReaction'

const props = defineProps<{
  accountId: string
  noteId: string
}>()

const emit = defineEmits<{ close: [] }>()

const noteStore = useNoteStore()
const accountsStore = useAccountsStore()
const isCompact = useIsCompactLayout()
const { navigateToUser: navToUser } = useNavigation()
const { reactionUrl: reactionUrlRaw } = useEmojiResolver()

const note = ref<NormalizedNote | null>(null)
const ancestors = ref<NormalizedNote[]>([])
const children = ref<NormalizedNote[]>([])
const renotes = ref<NormalizedNote[]>([])
const reactions = ref<NoteReaction[]>([])
const isLoading = ref(true)
const error = ref<AppError | null>(null)

type DetailTab = 'replies' | 'renotes' | 'reactions'
const activeTab = ref<DetailTab>('replies')

const DETAIL_TABS: { key: DetailTab; label: string; icon: string }[] = [
  { key: 'replies', label: '返信', icon: 'ti ti-arrow-back-up' },
  { key: 'renotes', label: 'リノート', icon: 'ti ti-repeat' },
  { key: 'reactions', label: 'リアクション', icon: 'ti ti-mood-happy' },
]

let adapter: ServerAdapter | null = null

onMounted(async () => {
  const account = accountsStore.accounts.find((a) => a.id === props.accountId)
  if (!account) {
    error.value = new AppError('ACCOUNT_NOT_FOUND', 'Account not found')
    isLoading.value = false
    return
  }

  try {
    const result = await initAdapterFor(account.host, account.id, {
      pinnedReactions: false,
    })
    adapter = result.adapter
    note.value = await adapter.api.getNote(props.noteId)

    const [conv, replies] = await Promise.all([
      adapter.api
        .getNoteConversation(props.noteId)
        .catch(() => [] as NormalizedNote[]),
      adapter.api
        .getNoteChildren(props.noteId)
        .catch(() => [] as NormalizedNote[]),
    ])
    ancestors.value = conv.reverse()
    children.value = replies
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
})

const loadedTabs = ref<Set<DetailTab>>(new Set(['replies']))

watch(activeTab, async (tab) => {
  if (loadedTabs.value.has(tab) || !adapter) return
  loadedTabs.value.add(tab)
  try {
    if (tab === 'renotes') {
      renotes.value = await adapter.api.getNoteRenotes(props.noteId)
    } else if (tab === 'reactions') {
      reactions.value = await adapter.api.getNoteReactions(
        props.noteId,
        undefined,
        100,
      )
    }
  } catch (e) {
    console.warn('[NoteDetail] failed to load tab:', tab, e)
  }
})

function getReactionUrl(reaction: NoteReaction): string | null {
  if (!note.value) return null
  return reactionUrlRaw(
    reaction.type,
    note.value.emojis,
    note.value.reactionEmojis,
    note.value._serverHost,
  )
}

async function handleReaction(reaction: string, target: NormalizedNote) {
  if (!adapter) return
  try {
    await toggleReaction(adapter.api, target, reaction)
  } catch (e) {
    error.value = AppError.from(e)
  }
}

const showPostForm = ref(false)
const postFormReplyTo = ref<NormalizedNote | undefined>()
const postFormRenoteId = ref<string | undefined>()
const postFormEditNote = ref<NormalizedNote | undefined>()

async function handleRenote(target: NormalizedNote) {
  if (!adapter) return
  try {
    await adapter.api.createNote({ renoteId: target.id })
  } catch (e) {
    error.value = AppError.from(e)
  }
}

function handleReply(target: NormalizedNote) {
  postFormReplyTo.value = target
  postFormRenoteId.value = undefined
  showPostForm.value = true
}

function handleQuote(target: NormalizedNote) {
  postFormReplyTo.value = undefined
  postFormRenoteId.value = target.id
  showPostForm.value = true
}

function handleEdit(target: NormalizedNote) {
  postFormReplyTo.value = undefined
  postFormRenoteId.value = undefined
  postFormEditNote.value = target
  showPostForm.value = true
}

async function handleDelete(target: NormalizedNote) {
  if (!adapter) return
  try {
    await adapter.api.deleteNote(target.id)
    const id = target.id
    noteStore.remove(id)
    invoke('api_delete_cached_note', { noteId: id }).catch(() => {})
    if (id === note.value?.id) {
      emit('close')
    } else {
      children.value = children.value.filter(
        (n) => n.id !== id && n.renoteId !== id,
      )
      ancestors.value = ancestors.value.filter(
        (n) => n.id !== id && n.renoteId !== id,
      )
    }
  } catch (e) {
    error.value = AppError.from(e)
  }
}

async function handleDeleteAndEdit(target: NormalizedNote) {
  if (!adapter) return
  try {
    await adapter.api.deleteNote(target.id)
    const id = target.id
    noteStore.remove(id)
    invoke('api_delete_cached_note', { noteId: id }).catch(() => {})
    if (id === note.value?.id) {
      // Reopen post form for the focal note
      postFormReplyTo.value = target.replyId
        ? await adapter.api.getNote(target.replyId).catch(() => undefined)
        : undefined
      postFormRenoteId.value = undefined
      postFormEditNote.value = undefined
      showPostForm.value = true
    } else {
      children.value = children.value.filter(
        (n) => n.id !== id && n.renoteId !== id,
      )
      ancestors.value = ancestors.value.filter(
        (n) => n.id !== id && n.renoteId !== id,
      )
      postFormReplyTo.value = target.replyId
        ? await adapter.api.getNote(target.replyId).catch(() => undefined)
        : undefined
      postFormRenoteId.value = undefined
      postFormEditNote.value = undefined
      showPostForm.value = true
    }
  } catch (e) {
    error.value = AppError.from(e)
  }
}

function closePostForm() {
  showPostForm.value = false
  postFormReplyTo.value = undefined
  postFormRenoteId.value = undefined
  postFormEditNote.value = undefined
}

function buildTree(
  notes: NormalizedNote[],
  rootNoteId: string,
): NoteTreeNode[] {
  const childrenMap = new Map<string, NoteTreeNode[]>()
  for (const n of notes) {
    const parentId = n.replyId ?? rootNoteId
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, [])
    childrenMap.get(parentId)?.push({ note: n, children: [] })
  }

  function attachChildren(node: NoteTreeNode): NoteTreeNode {
    node.children = childrenMap.get(node.note.id) ?? []
    for (const child of node.children) attachChildren(child)
    return node
  }

  const roots = childrenMap.get(rootNoteId) ?? []
  for (const root of roots) attachChildren(root)
  return roots
}

const childrenTree = computed<NoteTreeNode[]>(() => {
  if (!note.value) return []
  return buildTree(children.value, note.value.id)
})

const treeHandlers = computed<NoteTreeHandlers>(() => ({
  react: handleReaction,
  reply: handleReply,
  renote: handleRenote,
  quote: handleQuote,
  deleteFn: handleDelete,
  edit: handleEdit,
  deleteAndEdit: handleDeleteAndEdit,
}))

async function handlePosted(editedNoteId?: string) {
  closePostForm()
  if (editedNoteId && adapter) {
    try {
      const updated = await adapter.api.getNote(editedNoteId)
      if (note.value?.id === editedNoteId) {
        note.value = updated
      }
      children.value = children.value.map((n) =>
        n.id === editedNoteId
          ? updated
          : n.renoteId === editedNoteId
            ? { ...n, renote: updated }
            : n,
      )
      ancestors.value = ancestors.value.map((n) =>
        n.id === editedNoteId
          ? updated
          : n.renoteId === editedNoteId
            ? { ...n, renote: updated }
            : n,
      )
    } catch {
      // note may have been deleted
    }
  }
}
</script>

<template>
  <div :class="[$style.noteDetailContent, { [$style.mobile]: isCompact }]">
    <div v-if="isLoading" :class="$style.stateMessage">読み込み中...</div>

    <div v-else-if="error" :class="[$style.stateMessage, $style.stateError]">
      <p>{{ error.message }}</p>
    </div>

    <div v-else-if="note" :class="$style.noteDetail">
      <div v-if="ancestors.length > 0" :class="$style.ancestors">
        <MkNote
          v-for="ancestor in ancestors"
          :key="ancestor.id"
          :note="ancestor"
          @react="handleReaction"
          @reply="handleReply"
          @renote="handleRenote"
          @quote="handleQuote"
          @delete="handleDelete"
          @edit="handleEdit"
          @delete-and-edit="handleDeleteAndEdit"
        />
      </div>

      <div :class="$style.focalNote">
        <MkNote
          :note="note"
          detailed
          @react="handleReaction"
          @reply="handleReply"
          @renote="handleRenote"
          @quote="handleQuote"
          @delete="handleDelete"
          @edit="handleEdit"
          @delete-and-edit="handleDeleteAndEdit"
        />
      </div>

      <!-- Tabs -->
      <div :class="$style.detailTabs">
        <button
          v-for="tab in DETAIL_TABS"
          :key="tab.key"
          class="_button"
          :class="[$style.detailTabItem, { [$style.active]: activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >
          <i :class="tab.icon" />
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab: Replies -->
      <div v-if="activeTab === 'replies'">
        <MkNoteTree
          v-if="childrenTree.length > 0"
          :nodes="childrenTree"
          :account-id="accountId"
          :handlers="treeHandlers"
        />
        <div v-if="children.length === 0" :class="$style.stateMessage">
          返信はありません
        </div>
      </div>

      <!-- Tab: Renotes -->
      <div v-if="activeTab === 'renotes'">
        <div v-if="renotes.length > 0" :class="$style.renoteUsers">
          <button
            v-for="rn in renotes"
            :key="rn.id"
            class="_button"
            :class="$style.renoteUserItem"
            @click="navToUser(accountId, rn.user.id)"
          >
            <MkAvatar
              :avatar-url="rn.user.avatarUrl"
              :decorations="rn.user.avatarDecorations"
              :size="36"
            />
            <span :class="$style.renoteUserName">
              {{ rn.user.name || rn.user.username }}
            </span>
            <span :class="$style.renoteUserHandle">
              @{{ rn.user.username }}
            </span>
          </button>
        </div>
        <div v-else :class="$style.stateMessage">
          リノートはありません
        </div>
      </div>

      <!-- Tab: Reactions -->
      <div v-if="activeTab === 'reactions'">
        <div v-if="reactions.length > 0" :class="$style.reactionUsers">
          <div
            v-for="r in reactions"
            :key="r.id"
            :class="$style.reactionUserItem"
          >
            <button
              class="_button"
              :class="$style.reactionUserLeft"
              @click="navToUser(accountId, r.user.id)"
            >
              <MkAvatar
                :avatar-url="r.user.avatarUrl"
                :decorations="r.user.avatarDecorations"
                :size="36"
              />
              <span :class="$style.reactionUserName">
                {{ r.user.name || r.user.username }}
              </span>
              <span :class="$style.reactionUserHandle">
                @{{ r.user.username }}
              </span>
            </button>
            <span :class="$style.reactionType">
              <img
                v-if="getReactionUrl(r)"
                :src="proxyUrl(getReactionUrl(r)!)"
                :alt="r.type"
                :class="$style.reactionEmojiImg"
                decoding="async"
              />
              <MkEmoji v-else :emoji="r.type" :class="$style.reactionEmoji" />
            </span>
          </div>
        </div>
        <div v-else :class="$style.stateMessage">
          リアクションはありません
        </div>
      </div>
    </div>

    <Teleport to="body">
      <MkPostForm
        v-if="showPostForm"
        :account-id="accountId"
        :reply-to="postFormReplyTo"
        :renote-id="postFormRenoteId"
        :edit-note="postFormEditNote"
        @close="closePostForm"
        @posted="handlePosted"
      />
    </Teleport>
  </div>
</template>

<style lang="scss" module>
.noteDetailContent {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--nd-bg);
}

.noteDetail {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.ancestors {
  opacity: 0.85;

  :deep(.note-root + .note-root) {
    border-top: none;
  }
}

.focalNote {
  border-top: 2px solid var(--nd-accent);
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-panelHighlight);
}

.detailTabs {
  display: flex;
  border-bottom: solid 0.5px var(--nd-divider);
  position: sticky;
  top: 0;
  background: var(--nd-bg);
  z-index: 5;
}

.detailTabItem {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 8px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.6;
  border-bottom: 2px solid transparent;
  transition: opacity var(--nd-duration-base), border-color var(--nd-duration-base);

  &:hover {
    opacity: 0.8;
  }

  &.active {
    color: var(--nd-accent);
    opacity: 1;
    border-bottom-color: var(--nd-accent);
  }

  i {
    font-size: 1em;
  }
}

.renoteUsers {
  display: flex;
  flex-direction: column;
}

.renoteUserItem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 24px;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-panelHighlight);
  }
}

.renoteUserName {
  font-weight: bold;
  font-size: 0.9em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.renoteUserHandle {
  font-size: 0.8em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reactionUsers {
  display: flex;
  flex-direction: column;
}

.reactionUserItem {
  display: flex;
  align-items: center;
  padding: 10px 24px;
  gap: 10px;
}

.reactionUserLeft {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.7;
  }
}

.reactionUserName {
  font-weight: bold;
  font-size: 0.9em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reactionUserHandle {
  font-size: 0.8em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reactionType {
  flex-shrink: 0;
}

.reactionEmojiImg {
  height: 1.5em;
  width: auto;
}

.reactionEmoji {
  font-size: 1.5em;
}

.stateMessage {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--nd-fg);
  opacity: 0.6;
  font-size: 0.9em;
}

.stateError {
  color: var(--nd-love);
  opacity: 1;
}

.mobile {
  .detailTabItem {
    min-height: 44px;
  }

  .renoteUserItem,
  .reactionUserItem {
    padding: 10px 16px;
  }
}

/* Empty placeholder classes for dynamic binding */
.active {}
</style>
