<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'
import { AppError } from '@/utils/errors'
import { isSafeUrl } from '@/utils/url'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const accountsStore = useAccountsStore()
const themeStore = useThemeStore()
const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === props.column.accountId),
)
const columnThemeVars = computed(() => {
  const accountId = props.column.accountId
  if (!accountId) return undefined
  return themeStore.getStyleVarsForAccount(accountId)
})

interface GalleryPost {
  id: string
  title: string
  description: string | null
  fileIds: string[]
  files: GalleryFile[]
  isSensitive: boolean
  likedCount: number
  isLiked: boolean
  createdAt: string
  user: {
    id: string
    username: string
    name: string | null
    avatarUrl: string | null
    host: string | null
  }
}

interface GalleryFile {
  id: string
  name: string
  type: string
  url: string
  thumbnailUrl: string | null
  isSensitive: boolean
}

const posts = ref<GalleryPost[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const hasMore = ref(true)

const detailPost = ref<GalleryPost | null>(null)
const detailImageIndex = ref(0)
const liking = ref(false)

async function fetchGallery(older = false) {
  if (!props.column.accountId) return
  if (older && !hasMore.value) return
  loading.value = true
  error.value = null

  try {
    const params: Record<string, unknown> = { limit: 20 }
    if (older && posts.value.length > 0) {
      params.untilId = posts.value[posts.value.length - 1]!.id
    }
    const result = await invoke<GalleryPost[]>('api_request', {
      accountId: props.column.accountId,
      endpoint: 'gallery/posts',
      params,
    })
    if (older) {
      posts.value.push(...result)
    } else {
      posts.value = result
    }
    hasMore.value = result.length >= 20
  } catch (e) {
    error.value = AppError.from(e).message
  } finally {
    loading.value = false
  }
}

function openDetail(post: GalleryPost) {
  detailPost.value = post
  detailImageIndex.value = 0
}

function closeDetail() {
  detailPost.value = null
  detailImageIndex.value = 0
}

function prevImage() {
  if (detailImageIndex.value > 0) {
    detailImageIndex.value--
  }
}

function nextImage() {
  if (detailPost.value && detailImageIndex.value < detailPost.value.files.length - 1) {
    detailImageIndex.value++
  }
}

async function toggleLike() {
  if (!detailPost.value || !props.column.accountId || liking.value) return
  liking.value = true
  try {
    const endpoint = detailPost.value.isLiked
      ? 'gallery/posts/unlike'
      : 'gallery/posts/like'
    await invoke('api_request', {
      accountId: props.column.accountId,
      endpoint,
      params: { postId: detailPost.value.id },
    })
    detailPost.value.isLiked = !detailPost.value.isLiked
    detailPost.value.likedCount += detailPost.value.isLiked ? 1 : -1
    const idx = posts.value.findIndex((p) => p.id === detailPost.value!.id)
    if (idx >= 0) {
      posts.value[idx] = { ...detailPost.value }
    }
  } catch {
    // ignore
  } finally {
    liking.value = false
  }
}

function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return isSafeUrl(url) ? url : undefined
}

function isImage(file: GalleryFile): boolean {
  return file.type.startsWith('image/')
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && !loading.value && hasMore.value) {
    fetchGallery(true)
  }
}

const canGoBack = computed(() => detailPost.value !== null)

function goBack() {
  closeDetail()
}

// Initial load
fetchGallery()
</script>

<template>
  <DeckColumn :column-id="column.id" :title="column.name ?? 'ギャラリー'" :theme-vars="columnThemeVars">
    <template #header-icon>
      <i class="ti ti-icons tl-header-icon" />
    </template>

    <template #header-meta>
      <button v-if="canGoBack" class="_button header-refresh" title="戻る" @click.stop="goBack">
        <i class="ti ti-arrow-left" />
      </button>
      <button v-if="!detailPost" class="_button header-refresh" title="更新" :disabled="loading" @click.stop="fetchGallery()">
        <i class="ti ti-refresh" :class="{ spin: loading }" />
      </button>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
      </div>
    </template>

    <!-- Detail view -->
    <template v-if="detailPost">
      <div class="gallery-detail-scroll">
        <div class="gallery-detail">
          <!-- Image viewer -->
          <div class="gallery-detail-viewer">
            <template v-if="detailPost.files.length > 0">
              <div class="gallery-viewer-image">
                <img
                  v-if="isImage(detailPost.files[detailImageIndex]!) && !detailPost.files[detailImageIndex]!.isSensitive"
                  :src="safeUrl(detailPost.files[detailImageIndex]!.url)"
                  :alt="detailPost.files[detailImageIndex]!.name"
                  class="gallery-detail-img"
                />
                <div v-else-if="detailPost.files[detailImageIndex]!.isSensitive" class="gallery-viewer-placeholder">
                  <i class="ti ti-eye-off" />
                  <span>NSFW</span>
                </div>
                <div v-else class="gallery-viewer-placeholder">
                  <i class="ti ti-file" />
                </div>
              </div>
              <!-- Navigation arrows -->
              <template v-if="detailPost.files.length > 1">
                <button
                  v-if="detailImageIndex > 0"
                  class="_button gallery-nav-btn gallery-nav-prev"
                  @click="prevImage"
                >
                  <i class="ti ti-chevron-left" />
                </button>
                <button
                  v-if="detailImageIndex < detailPost.files.length - 1"
                  class="_button gallery-nav-btn gallery-nav-next"
                  @click="nextImage"
                >
                  <i class="ti ti-chevron-right" />
                </button>
                <!-- Dots indicator -->
                <div class="gallery-dots">
                  <span
                    v-for="(_, i) in detailPost.files"
                    :key="i"
                    class="gallery-dot"
                    :class="{ active: i === detailImageIndex }"
                    @click="detailImageIndex = i"
                  />
                </div>
              </template>
            </template>
          </div>

          <!-- Post info -->
          <div class="gallery-detail-info">
            <div class="gallery-detail-title">{{ detailPost.title }}</div>
            <div v-if="detailPost.description" class="gallery-detail-desc">{{ detailPost.description }}</div>
            <div class="gallery-detail-meta">
              <div class="gallery-detail-user">
                <img
                  v-if="detailPost.user.avatarUrl"
                  :src="detailPost.user.avatarUrl"
                  class="gallery-user-avatar"
                />
                <span class="gallery-user-name">{{ detailPost.user.name || detailPost.user.username }}</span>
              </div>
              <span class="gallery-detail-date">{{ formatDate(detailPost.createdAt) }}</span>
            </div>
            <div class="gallery-detail-actions">
              <button
                class="_button gallery-like-btn"
                :class="{ liked: detailPost.isLiked }"
                :disabled="liking"
                @click="toggleLike"
              >
                <i :class="detailPost.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" />
                <span v-if="detailPost.likedCount > 0">{{ detailPost.likedCount }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Grid view -->
    <template v-else>
      <div class="gallery-grid-scroll" @scroll="onScroll">
        <div v-if="loading && posts.length === 0" class="column-empty">読み込み中...</div>
        <div v-else-if="error" class="column-empty column-error">{{ error }}</div>
        <div v-else-if="posts.length === 0" class="column-empty">
          ギャラリーの投稿がありません
        </div>
        <template v-else>
          <div class="gallery-grid">
            <button
              v-for="post in posts"
              :key="post.id"
              class="_button gallery-grid-cell"
              @click="openDetail(post)"
            >
              <div class="gallery-grid-thumb">
                <img
                  v-if="post.files.length > 0 && isImage(post.files[0]!) && !post.isSensitive"
                  :src="safeUrl(post.files[0]!.thumbnailUrl) || safeUrl(post.files[0]!.url)"
                  :alt="post.title"
                  class="gallery-grid-img"
                  loading="lazy"
                />
                <div v-else-if="post.isSensitive" class="gallery-grid-placeholder">
                  <i class="ti ti-eye-off" />
                </div>
                <div v-else class="gallery-grid-placeholder">
                  <i class="ti ti-photo" />
                </div>
                <div v-if="post.files.length > 1" class="gallery-grid-badge">
                  <i class="ti ti-stack-2" />
                  {{ post.files.length }}
                </div>
              </div>
              <div class="gallery-grid-info">
                <div class="gallery-grid-title">{{ post.title }}</div>
                <div class="gallery-grid-footer">
                  <span class="gallery-grid-user">
                    <img
                      v-if="post.user.avatarUrl"
                      :src="post.user.avatarUrl"
                      class="gallery-grid-avatar"
                    />
                    {{ post.user.name || post.user.username }}
                  </span>
                  <span v-if="post.likedCount > 0" class="gallery-grid-likes">
                    <i class="ti ti-heart" /> {{ post.likedCount }}
                  </span>
                </div>
              </div>
            </button>
          </div>
          <div v-if="loading" class="column-empty">読み込み中...</div>
        </template>
      </div>
    </template>
  </DeckColumn>
</template>

<style scoped>
@import "./column-common.css";

/* --- Grid scroll --- */
.gallery-grid-scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

/* --- Grid --- */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px;
  padding: 2px;
}

.gallery-grid-cell {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: opacity 0.15s;
}

.gallery-grid-cell:hover {
  opacity: 0.8;
}

.gallery-grid-thumb {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--nd-bg);
}

.gallery-grid-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-grid-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  opacity: 0.3;
}

.gallery-grid-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 11px;
}

.gallery-grid-info {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gallery-grid-title {
  font-size: 0.75em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-grid-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.gallery-grid-user {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.65em;
  color: var(--nd-fg);
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.gallery-grid-avatar {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.gallery-grid-likes {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.65em;
  color: var(--nd-love);
  flex-shrink: 0;
}

/* --- Detail view --- */
.gallery-detail-scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.gallery-detail {
  display: flex;
  flex-direction: column;
}

.gallery-detail-viewer {
  position: relative;
  background: var(--nd-bg);
}

.gallery-viewer-image {
  aspect-ratio: 4 / 3;
  overflow: hidden;
}

.gallery-detail-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.gallery-viewer-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 32px;
  opacity: 0.3;
}

.gallery-viewer-placeholder span {
  font-size: 14px;
}

.gallery-nav-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 16px;
  transition: background 0.15s;
}

.gallery-nav-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

.gallery-nav-prev {
  left: 8px;
}

.gallery-nav-next {
  right: 8px;
}

.gallery-dots {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
}

.gallery-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: background 0.15s;
}

.gallery-dot.active {
  background: #fff;
}

/* --- Detail info --- */
.gallery-detail-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}

.gallery-detail-title {
  font-size: 1em;
  font-weight: 700;
  color: var(--nd-fgHighlighted);
}

.gallery-detail-desc {
  font-size: 0.85em;
  color: var(--nd-fg);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.gallery-detail-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.gallery-detail-user {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.gallery-user-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
}

.gallery-user-name {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-detail-date {
  font-size: 0.8em;
  opacity: 0.5;
  flex-shrink: 0;
}

.gallery-detail-actions {
  display: flex;
  gap: 8px;
}

.gallery-like-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nd-love) 10%, transparent);
  color: var(--nd-fg);
  font-size: 0.85em;
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}

.gallery-like-btn:hover {
  background: color-mix(in srgb, var(--nd-love) 20%, transparent);
}

.gallery-like-btn.liked {
  color: var(--nd-love);
  background: color-mix(in srgb, var(--nd-love) 15%, transparent);
}

.gallery-like-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
