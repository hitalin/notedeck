<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import MkSkeleton from '@/components/common/MkSkeleton.vue'
import {
  type NoteColumnConfig,
  useNoteColumn,
} from '@/composables/useNoteColumn'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
  title: string
  icon: string
  webUiPath?: string
  soundEnabled?: boolean
  showInlinePostForm?: boolean
  noteColumnConfig: NoteColumnConfig
}>()

const {
  account,
  columnThemeVars,
  serverIconUrl,
  isLoading,
  isOffline,
  error,
  notes,
  focusedNoteId,
  pendingNotes,
  animateEnter,
  postForm,
  handlers,
  noteScrollerRef,
  scrollToTop,
  handleScroll,
  handlePosted,
  removeNote,
  refresh,
  isPulling,
  isPulledEnough,
  isRefreshing,
  pullDistance,
  displayHeight,
} = useNoteColumn(props.noteColumnConfig)

const isStreaming = !!props.noteColumnConfig.streaming

const webUiUrl = computed(() => {
  if (!props.webUiPath || !account.value) return undefined
  return `https://${account.value.host}${props.webUiPath}`
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name || title"
    :theme-vars="columnThemeVars"
    :web-ui-url="webUiUrl"
    :sound-enabled="soundEnabled"
    @header-click="scrollToTop()"
  >
    <template #header-icon>
      <i :class="[$style.tlHeaderIcon, 'ti ' + icon]" />
    </template>

    <template #header-meta>
      <button
        v-if="!isStreaming"
        :class="$style.headerRefresh"
        class="_button"
        title="Refresh"
        :disabled="isLoading"
        @click.stop="refresh"
      >
        <i
          class="ti ti-refresh"
          :class="{ [String($style.spin)]: isLoading }"
        />
      </button>
      <div v-if="account" :class="$style.headerAccount">
        <img
          v-if="account.avatarUrl"
          :src="account.avatarUrl"
          :class="$style.headerAvatar"
        />
        <img
          :class="$style.headerFavicon"
          :src="
            serverIconUrl || `https://${account.host}/favicon.ico`
          "
          :title="account.host"
        />
      </div>
    </template>

    <div v-if="!account" :class="$style.columnEmpty">
      Account not found
    </div>

    <div
      v-else-if="error"
      :class="[$style.columnEmpty, $style.columnError]"
    >
      {{ error.message }}
    </div>

    <div v-else :class="$style.tlBody">
      <div
        v-if="isPulling"
        :class="$style.pullFrame"
        :style="`--frame-min-height: ${displayHeight()}px`"
      >
        <div :class="$style.pullFrameContent">
          <i v-if="isRefreshing" class="ti ti-loader-2" :class="$style.spin" />
          <i v-else class="ti ti-arrow-bar-to-down" :class="{ refresh: isPulledEnough }" />
          <div :class="$style.pullText">
            <template v-if="isPulledEnough">離してリフレッシュ</template>
            <template v-else-if="isRefreshing">リフレッシュ中…</template>
            <template v-else>下に引いてリフレッシュ</template>
          </div>
        </div>
      </div>

      <div v-if="isOffline" :class="$style.offlineBanner">
        <i class="ti ti-cloud-off" />オフライン
      </div>

      <!-- Inline post form slot (e.g. channel column) -->
      <slot name="before-notes" :handle-posted="handlePosted" />

      <div v-if="isLoading && notes.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <template v-else>
        <button
          v-if="pendingNotes.length > 0"
          :class="$style.newNotesBanner"
          class="_button"
          @click="scrollToTop()"
        >
          <i class="ti ti-arrow-up" />{{ pendingNotes.length
          }}件の新しいノート
        </button>

        <NoteScroller
          ref="noteScrollerRef"
          :items="notes"
          :focused-id="focusedNoteId"
          :animate="animateEnter"
          :class="$style.tlScroller"
          @scroll="handleScroll"
        >
          <template #default="{ item, index }">
            <div :data-index="index">
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
            </div>
          </template>

          <template #append>
            <div
              v-if="isLoading && notes.length > 0"
              :class="$style.loadingMore"
            >
              Loading...
            </div>
          </template>
        </NoteScroller>
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

<style lang="scss" module>
@use './column-common.module.scss';
</style>
