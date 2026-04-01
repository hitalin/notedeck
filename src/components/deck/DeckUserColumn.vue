<script setup lang="ts">
import { defineAsyncComponent, ref, useTemplateRef, watch } from 'vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import type { NormalizedUser } from '@/adapters/types'
import { useNoteColumn } from '@/composables/useNoteColumn'
import { usePortal } from '@/composables/usePortal'
import { getAccountAvatarUrl } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { invoke } from '@/utils/tauriInvoke'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const deckStore = useDeckStore()

// User search state
const userSearchInput = ref('')
const searchResults = ref<NormalizedUser[]>([])
const selectedIndex = ref(0)
const searching = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | undefined

watch(userSearchInput, (val) => {
  const q = val.trim().replace(/^@/, '')
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!q || !props.column.accountId) {
    searchResults.value = []
    return
  }
  debounceTimer = setTimeout(() => searchUsers(q), 300)
})

async function searchUsers(query: string) {
  if (!props.column.accountId) return
  searching.value = true
  try {
    // Fuzzy search + exact lookup in parallel
    const [searchResult, lookupResult] = await Promise.allSettled([
      invoke<NormalizedUser[]>('api_search_users_by_query', {
        accountId: props.column.accountId,
        query,
        limit: 8,
      }),
      tryLookupUser(query),
    ])

    const results =
      searchResult.status === 'fulfilled' ? searchResult.value : []
    const looked =
      lookupResult.status === 'fulfilled' ? lookupResult.value : null

    // Merge: prepend lookup result if not already in search results
    if (looked && !results.some((u) => u.id === looked.id)) {
      searchResults.value = [looked, ...results]
    } else {
      searchResults.value = results
    }
    selectedIndex.value = 0
  } catch {
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

/** Try exact lookup by @user or @user@host. Returns null if not found or not applicable. */
async function tryLookupUser(query: string): Promise<NormalizedUser | null> {
  if (!props.column.accountId) return null
  const parts = query.split('@')
  const username = parts[0] || ''
  const host = parts[1] || null
  if (!username) return null
  try {
    return await invoke<NormalizedUser>('api_lookup_user', {
      accountId: props.column.accountId,
      username,
      host,
    })
  } catch {
    return null
  }
}

function selectUser(user: NormalizedUser) {
  const displayName = user.host
    ? `@${user.username}@${user.host}`
    : `@${user.username}`
  deckStore.updateColumn(props.column.id, {
    userId: user.id,
    name: displayName,
  })
  userSearchInput.value = ''
  searchResults.value = []
  reconnect()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(
      selectedIndex.value + 1,
      searchResults.value.length - 1,
    )
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const selected = searchResults.value[selectedIndex.value]
    if (selected) selectUser(selected)
  }
}

function userLabel(user: NormalizedUser): string {
  return user.host ? `@${user.username}@${user.host}` : `@${user.username}`
}

const {
  account,
  columnThemeVars,
  serverIconUrl,
  isLoading,
  error,
  notes,
  focusedNoteId,
  postForm,
  handlers,
  noteScrollerRef,
  scrollToTop,
  handleScroll,
  handlePosted,
  removeNote,
  refresh,
  reconnect,
  isPulling,
  isPulledEnough,
  isRefreshing,
  pullDistance,
  displayHeight,
  loadMore,
} = useNoteColumn({
  getColumn: () => props.column,
  fetch: (adapter, opts) =>
    // biome-ignore lint/style/noNonNullAssertion: guarded by validate
    adapter.api.getUserNotes(props.column.userId!, opts),
  validate: () => !!props.column.userId,
  cache: {
    getKey: () => (props.column.userId ? `user:${props.column.userId}` : null),
  },
  refreshFetch: async (adapter, currentNotes) => {
    // biome-ignore lint/style/noNonNullAssertion: guarded by validate
    const userId = props.column.userId!
    const firstNote = currentNotes[0]
    if (firstNote) {
      const newer = await adapter.api.getUserNotes(userId, {
        sinceId: firstNote.id,
      })
      return { notes: newer.reverse(), mode: 'prepend' as const }
    }
    const fetched = await adapter.api.getUserNotes(userId)
    return { notes: fetched, mode: 'replace' as const }
  },
})

const postFormPortalRef = useTemplateRef<HTMLElement>('postFormPortalRef')
usePortal(postFormPortalRef)
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name || 'ユーザー'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop()"
    @refresh="refresh"
  >
    <template #header-icon>
      <i :class="$style.tlHeaderIcon" class="ti ti-user" />
    </template>

    <template #header-meta>
      <div v-if="account" :class="$style.headerAccount">
        <img :src="getAccountAvatarUrl(account)" :class="$style.headerAvatar" />
        <img :class="$style.headerFavicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <template v-if="!column.userId" #header-extra>
      <div :class="$style.searchBar">
        <i :class="$style.searchIcon" class="ti ti-search" />
        <input
          v-model="userSearchInput"
          :class="$style.searchInput"
          type="text"
          placeholder="ユーザーを検索..."
          @keydown="onKeydown"
        />
        <i v-if="searching" class="ti ti-loader-2 nd-spin" :class="$style.searchIcon" />
      </div>
      <div v-if="searchResults.length > 0" :class="$style.searchResults">
        <button
          v-for="(user, i) in searchResults"
          :key="user.id"
          :class="[$style.searchResultItem, { [$style.searchResultSelected]: i === selectedIndex }]"
          @click="selectUser(user)"
          @mouseenter="selectedIndex = i"
        >
          <img v-if="user.avatarUrl" :src="user.avatarUrl" :class="$style.searchResultAvatar" />
          <div :class="$style.searchResultInfo">
            <span v-if="user.name" :class="$style.searchResultName">{{ user.name }}</span>
            <span :class="$style.searchResultHandle">{{ userLabel(user) }}</span>
          </div>
        </button>
      </div>
    </template>

    <div v-if="!account" :class="$style.columnEmpty">
      アカウントが見つかりません
    </div>

    <div v-else-if="!column.userId" :class="$style.columnEmpty">
      ユーザーを指定してください
    </div>

    <div v-else-if="error" :class="[$style.columnEmpty, $style.columnError]">
      {{ error.message }}
    </div>

    <div v-else :class="$style.tlBody">
      <div
        v-if="isPulling"
        :class="$style.pullFrame"
        :style="`--frame-min-height: ${displayHeight()}px`"
      >
        <div :class="$style.pullFrameContent">
          <i v-if="isRefreshing" class="ti ti-loader-2 nd-spin" />
          <i v-else class="ti ti-arrow-bar-to-down" :class="{ refresh: isPulledEnough }" />
          <div :class="$style.pullText">
            <template v-if="isPulledEnough">離してリフレッシュ</template>
            <template v-else-if="isRefreshing">リフレッシュ中…</template>
            <template v-else>下に引いてリフレッシュ</template>
          </div>
        </div>
      </div>
      <div v-if="isLoading && notes.length === 0" :class="$style.columnLoading">
        <LoadingSpinner />
      </div>
      <template v-if="!(isLoading && notes.length === 0)">
        <NoteScroller ref="noteScrollerRef" :items="notes" :focused-id="focusedNoteId" :class="$style.tlScroller" @scroll="handleScroll" @near-end="loadMore">
          <template #default="{ item, index }">
            <div>
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
                @delete-and-edit="handlers.deleteAndEdit"
              />
            </div>
          </template>

          <template #append>
            <div v-if="isLoading && notes.length > 0" :class="$style.loadingMore">
              <LoadingSpinner />
            </div>
          </template>
        </NoteScroller>
      </template>
    </div>
  </DeckColumn>

  <div v-if="postForm.show.value && column.accountId && account?.hasToken" ref="postFormPortalRef">
    <MkPostForm
      :account-id="column.accountId"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      :initial-text="postForm.initialText.value"
      :initial-cw="postForm.initialCw.value"
      :initial-visibility="postForm.initialVisibility.value"
      @close="postForm.close"
      @posted="handlePosted"
    />
  </div>
</template>

<style lang="scss" module>
@use "./column-common.module.scss";

.searchBar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-bg);
}

.searchIcon {
  flex-shrink: 0;
  opacity: 0.4;
}

.searchInput {
  flex: 1;
  min-width: 0;
  background: var(--nd-buttonBg);
  border: none;
  border-radius: var(--nd-radius-sm);
  padding: 6px 10px;
  font-size: 0.85em;
  color: var(--nd-fg);
  outline: none;

  &:focus {
    box-shadow: 0 0 0 2px var(--nd-accent);
  }

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.4;
  }
}

.searchResults {
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-bg);
  max-height: 300px;
  overflow-y: auto;
}

.searchResultItem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: none;
  color: var(--nd-fg);
  font-size: 0.85em;
  cursor: pointer;
  text-align: left;

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.searchResultSelected {
  background: var(--nd-accentedBg, rgba(134, 179, 0, 0.15));
}

.searchResultAvatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  object-fit: cover;
}

.searchResultInfo {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.searchResultName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.searchResultHandle {
  font-size: 0.9em;
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
