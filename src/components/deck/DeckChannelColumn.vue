<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import MkNote from '@/components/common/MkNote.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useNoteColumn } from '@/composables/useNoteColumn'
import { useAccountsStore } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'
import { createAdapter } from '@/adapters/registry'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import type { ServerAdapter } from '@/adapters/types'
import { AppError } from '@/utils/errors'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const {
  account,
  columnThemeVars,
  serverIconUrl,
  isLoading,
  error,
  notes,
  focusedNoteId,
  pendingNotes,
  postForm,
  handlers,
  scroller,
  scrollToTop,
  handleScroll,
  handlePosted,
  removeNote,
} = useNoteColumn({
  getColumn: () => props.column,
  fetch: (adapter, opts) =>
    // biome-ignore lint/style/noNonNullAssertion: guarded by validate
    adapter.api.getChannelNotes(props.column.channelId!, opts),
  validate: () => !!props.column.channelId,
  cache: {
    getKey: () =>
      props.column.channelId ? `channel:${props.column.channelId}` : null,
  },
  streaming: {
    subscribe: (adapter, enqueue, callbacks) =>
      adapter.stream.subscribeChannel(
        // biome-ignore lint/style/noNonNullAssertion: guarded by validate
        props.column.channelId!,
        enqueue,
        callbacks,
      ),
  },
})

const webUiUrl = computed(() =>
  account.value && props.column.channelId
    ? `https://${account.value.host}/channels/${props.column.channelId}`
    : undefined,
)

// --- Inline post form ---
const inlineText = ref('')
const isInlinePosting = ref(false)
const inlineError = ref<string | null>(null)
const inlineTextarea = ref<HTMLTextAreaElement | null>(null)

let inlineAdapter: ServerAdapter | null = null

async function ensureAdapter() {
  if (inlineAdapter) return inlineAdapter
  const acc = account.value
  if (!acc) return null
  const serversStore = useServersStore()
  const serverInfo = await serversStore.getServerInfo(acc.host)
  inlineAdapter = createAdapter(serverInfo, acc.id)
  return inlineAdapter
}

const canInlinePost = computed(
  () => inlineText.value.trim().length > 0 && !isInlinePosting.value,
)

async function inlinePost() {
  if (!canInlinePost.value || !props.column.channelId) return
  isInlinePosting.value = true
  inlineError.value = null
  try {
    const adapter = await ensureAdapter()
    if (!adapter) return
    await adapter.api.createNote({
      text: inlineText.value,
      channelId: props.column.channelId,
    })
    inlineText.value = ''
    nextTick(() => {
      if (inlineTextarea.value) {
        inlineTextarea.value.style.height = 'auto'
      }
    })
  } catch (e) {
    inlineError.value = AppError.from(e).message
  } finally {
    isInlinePosting.value = false
  }
}

function onInlineKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    inlinePost()
  }
}

function autoResize(e: Event) {
  const textarea = e.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name || 'チャンネル'"
    :theme-vars="columnThemeVars"
    :web-ui-url="webUiUrl"
    sound-enabled
    @header-click="scrollToTop()"
  >
    <template #header-icon>
      <i class="ti ti-device-tv tl-header-icon" />
    </template>

    <template #header-meta>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img class="header-favicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="error" class="column-empty column-error">
      {{ error.message }}
    </div>

    <div v-else class="tl-body">
      <!-- Inline post form -->
      <div v-if="column.channelId && column.accountId" class="channel-post-form">
        <div class="channel-post-form-inner">
          <textarea
            ref="inlineTextarea"
            v-model="inlineText"
            class="channel-post-textarea"
            placeholder="投稿する..."
            rows="1"
            :disabled="isInlinePosting"
            @keydown="onInlineKeydown"
            @input="autoResize"
          />
          <button
            class="channel-post-button _button"
            :disabled="!canInlinePost"
            @click="inlinePost()"
          >
            <i class="ti ti-send" />
          </button>
        </div>
        <div v-if="inlineError" class="channel-post-error">{{ inlineError }}</div>
      </div>

      <div v-if="isLoading && notes.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <template v-else>
        <button
          v-if="pendingNotes.length > 0"
          class="new-notes-banner _button"
          @click="scrollToTop()"
        >
          {{ pendingNotes.length }} new notes
        </button>

        <DynamicScroller
          ref="scroller"
          class="tl-scroller"
          :items="notes"
          :min-item-size="120"
          :buffer="400"
          key-field="id"
          @scroll.passive="handleScroll"
        >
          <template #default="{ item, active, index }">
            <DynamicScrollerItem
              :item="item"
              :active="active"
              :data-index="index"
            >
              <MkNote
                :note="item"
                :focused="item.id === focusedNoteId"
                @react="handlers.reaction"
                @reply="handlers.reply"
                @renote="handlers.renote"
                @quote="handlers.quote"
                @delete="removeNote"
                @edit="handlers.edit"
                @bookmark="handlers.bookmark"
              />
            </DynamicScrollerItem>
          </template>

          <template #after>
            <div v-if="isLoading && notes.length > 0" class="loading-more">
              Loading...
            </div>
          </template>
        </DynamicScroller>
      </template>
    </div>
  </DeckColumn>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && column.accountId"
      :account-id="column.accountId"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      :channel-id="column.channelId"
      @close="postForm.close"
      @posted="handlePosted"
    />
  </Teleport>
</template>

<style scoped>
@import "./column-common.css";

.channel-post-form {
  flex-shrink: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--nd-divider);
}

.channel-post-form-inner {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.channel-post-textarea {
  flex: 1;
  min-height: 36px;
  max-height: 120px;
  padding: 8px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: 8px;
  background: var(--nd-panel);
  color: var(--nd-fg);
  font-size: 0.9em;
  font-family: inherit;
  line-height: 1.4;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
}

.channel-post-textarea:focus {
  border-color: var(--nd-accent);
}

.channel-post-textarea::placeholder {
  color: var(--nd-fg);
  opacity: 0.4;
}

.channel-post-textarea:disabled {
  opacity: 0.5;
}

.channel-post-button {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  font-size: 16px;
  transition: opacity 0.2s;
}

.channel-post-button:disabled {
  opacity: 0.4;
  cursor: default;
}

.channel-post-button:not(:disabled):hover {
  opacity: 0.85;
}

.channel-post-error {
  margin-top: 4px;
  font-size: 0.8em;
  color: var(--nd-love);
}
</style>
