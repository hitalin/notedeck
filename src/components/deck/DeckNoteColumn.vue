<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import {
  type NoteColumnConfig,
  useNoteColumn,
} from '@/composables/useNoteColumn'
import { getAccountAvatarUrl, isGuestAccount } from '@/stores/accounts'
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
  isLoggedOut,
  error,
  notes,
  focusedNoteId,
  pendingNotes,
  animatingIds,
  postForm,
  handlers,
  noteScrollerRef,
  scroller,
  scrollToTop,
  handleScroll,
  handlePosted,
  removeNote,
  loadMore,
  refresh,
  reconnect,
  switchWithSnapshot,
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

defineExpose({
  account,
  scroller,
  reconnect,
  switchWithSnapshot,
  notes,
  columnThemeVars,
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name || title"
    :theme-vars="columnThemeVars"
    :web-ui-url="webUiUrl"
    :sound-enabled="soundEnabled"
    :refreshable="!isStreaming"
    :refreshing="isLoading"
    @header-click="scrollToTop()"
    @refresh="refresh"
  >
    <template #header-icon>
      <slot name="header-icon">
        <i :class="[$style.tlHeaderIcon, 'ti ' + icon]" />
      </slot>
    </template>

    <template #header-meta>
      <div v-if="account" :class="$style.headerAccount">
        <img
          :src="getAccountAvatarUrl(account)"
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

    <template #header-extra>
      <slot name="header-extra" />
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

      <div v-if="isLoggedOut && account && !isGuestAccount(account)" :class="$style.loggedOutBanner">
        <i class="ti ti-logout" />ログアウト中
      </div>
      <div v-else-if="isOffline && !isLoggedOut" :class="$style.offlineBanner">
        <i class="ti ti-cloud-off" />オフライン
      </div>

      <!-- Inline post form slot (e.g. channel column) -->
      <slot name="before-notes" :handle-posted="handlePosted" />

      <div v-if="isLoading && notes.length === 0" :class="$style.columnLoading">
        <div :class="$style.columnLoadingSpinner" />
      </div>

      <template v-if="!(isLoading && notes.length === 0)">
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
          :animating-ids="animatingIds"
          :class="$style.tlScroller"
          @scroll="handleScroll"
          @near-end="loadMore"
        >
          <template #default="{ item, index, nearViewport }">
            <div>
              <MkNote
                :note="item"
                :focused="item.id === focusedNoteId"
                :near-viewport="nearViewport"
                @react="handlers.reaction"
                @reply="handlers.reply"
                @renote="handlers.renote"
                @quote="handlers.quote"
                @delete="removeNote"
                @edit="handlers.edit"
                @bookmark="handlers.bookmark"
                @delete-and-edit="handlers.deleteAndEdit"
              />
              <slot name="note-item" :item="item" :index="index" />
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
      v-if="postForm.show.value && column.accountId && account?.hasToken"
      :account-id="column.accountId"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      :initial-text="postForm.initialText.value"
      :initial-cw="postForm.initialCw.value"
      :initial-visibility="postForm.initialVisibility.value"
      :channel-id="column.channelId"
      @close="postForm.close"
      @posted="handlePosted"
    />
  </Teleport>
</template>

<style lang="scss" module>
@use './column-common.module.scss';
</style>
