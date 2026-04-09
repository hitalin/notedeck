<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import ColumnEmptyState from '@/components/common/ColumnEmptyState.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { useColumnPullScroller } from '@/composables/useColumnPullScroller'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { safeUrl } from '@/composables/useDriveFolder'
import { useServerImages } from '@/composables/useServerImages'
import { getAccountAvatarUrl } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { AppError, AUTH_ERROR_MESSAGE } from '@/utils/errors'
import { commands, unwrap } from '@/utils/tauriInvoke'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const { account, columnThemeVars } = useColumnTheme(() => props.column)
const { serverInfoImageUrl, serverNotFoundImageUrl, serverErrorImageUrl } =
  useServerImages(() => props.column)
const isLoggedOut = computed(() => account.value?.hasToken === false)

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
    const untilId =
      older && posts.value.length > 0
        ? posts.value[posts.value.length - 1]?.id
        : undefined
    const result = unwrap(
      await commands.apiGetGalleryPosts(
        props.column.accountId,
        20,
        untilId ?? null,
      ),
    ) as unknown as GalleryPost[]
    if (older) {
      posts.value.push(...result)
    } else {
      posts.value = result
    }
    hasMore.value = result.length >= 20
  } catch (e) {
    const appErr = AppError.from(e)
    error.value = appErr.isAuth ? AUTH_ERROR_MESSAGE : appErr.message
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
  if (
    detailPost.value &&
    detailImageIndex.value < detailPost.value.files.length - 1
  ) {
    detailImageIndex.value++
  }
}

async function toggleLike() {
  if (!detailPost.value || !props.column.accountId || liking.value) return
  liking.value = true
  try {
    if (detailPost.value.isLiked) {
      unwrap(
        await commands.apiUnlikeGalleryPost(
          props.column.accountId,
          detailPost.value.id,
        ),
      )
    } else {
      unwrap(
        await commands.apiLikeGalleryPost(
          props.column.accountId,
          detailPost.value.id,
        ),
      )
    }
    detailPost.value.isLiked = !detailPost.value.isLiked
    detailPost.value.likedCount += detailPost.value.isLiked ? 1 : -1
    const idx = posts.value.findIndex((p) => p.id === detailPost.value?.id)
    if (idx >= 0) {
      posts.value[idx] = { ...detailPost.value }
    }
  } catch {
    // ignore
  } finally {
    liking.value = false
  }
}

function isImage(file: GalleryFile): boolean {
  return file.type.startsWith('image/')
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

let lastScrollCheck = 0

function onScroll(e: Event) {
  const now = Date.now()
  if (now - lastScrollCheck < 200) return
  lastScrollCheck = now
  const el = e.target as HTMLElement
  if (
    el.scrollHeight - el.scrollTop - el.clientHeight < 200 &&
    !loading.value &&
    hasMore.value
  ) {
    fetchGallery(true)
  }
}

const galleryGridScrollRef = useTemplateRef<HTMLElement>('galleryGridScrollRef')
useColumnPullScroller(galleryGridScrollRef)
const galleryDetailScrollRef = useTemplateRef<HTMLElement>(
  'galleryDetailScrollRef',
)

function scrollToTop() {
  const el = detailPost.value
    ? galleryDetailScrollRef.value
    : galleryGridScrollRef.value
  el?.scrollTo({ top: 0, behavior: 'smooth' })
}

const canGoBack = computed(() => detailPost.value !== null)

function goBack() {
  closeDetail()
}

// Initial load
fetchGallery()
</script>

<template>
  <DeckColumn :column-id="column.id" :title="column.name ?? 'ギャラリー'" :theme-vars="columnThemeVars" :pull-refresh="fetchGallery" @header-click="scrollToTop" @refresh="fetchGallery()">
    <template #header-icon>
      <i class="ti ti-icons" :class="$style.tlHeaderIcon" />
    </template>

    <template #header-meta>
      <button v-if="canGoBack" class="_button" :class="$style.headerRefresh" title="戻る" @click.stop="goBack">
        <i class="ti ti-arrow-left" />
      </button>
      <div v-if="account" :class="$style.headerAccount">
        <img :src="getAccountAvatarUrl(account)" :class="$style.headerAvatar" />
      </div>
    </template>

    <!-- Detail view -->
    <template v-if="detailPost">
      <div ref="galleryDetailScrollRef" :class="$style.galleryDetailScroll">
        <div :class="$style.galleryDetail">
          <!-- Image viewer -->
          <div :class="$style.galleryDetailViewer">
            <template v-if="detailPost.files.length > 0">
              <div :class="$style.galleryViewerImage">
                <img
                  v-if="isImage(detailPost.files[detailImageIndex]!) && !detailPost.files[detailImageIndex]!.isSensitive"
                  :src="safeUrl(detailPost.files[detailImageIndex]!.url)"
                  :alt="detailPost.files[detailImageIndex]!.name"
                  :class="$style.galleryDetailImg"
                />
                <div v-else-if="detailPost.files[detailImageIndex]!.isSensitive" :class="$style.galleryViewerPlaceholder">
                  <i class="ti ti-eye-off" />
                  <span>NSFW</span>
                </div>
                <div v-else :class="$style.galleryViewerPlaceholder">
                  <i class="ti ti-file" />
                </div>
              </div>
              <!-- Navigation arrows -->
              <template v-if="detailPost.files.length > 1">
                <button
                  v-if="detailImageIndex > 0"
                  class="_button"
                  :class="[$style.galleryNavBtn, $style.galleryNavPrev]"
                  @click="prevImage"
                >
                  <i class="ti ti-chevron-left" />
                </button>
                <button
                  v-if="detailImageIndex < detailPost.files.length - 1"
                  class="_button"
                  :class="[$style.galleryNavBtn, $style.galleryNavNext]"
                  @click="nextImage"
                >
                  <i class="ti ti-chevron-right" />
                </button>
                <!-- Dots indicator -->
                <div :class="$style.galleryDots">
                  <span
                    v-for="(_, i) in detailPost.files"
                    :key="i"
                    :class="[$style.galleryDot, { [$style.active]: i === detailImageIndex }]"
                    @click="detailImageIndex = i"
                  />
                </div>
              </template>
            </template>
          </div>

          <!-- Post info -->
          <div :class="$style.galleryDetailInfo">
            <div :class="$style.galleryDetailTitle">{{ detailPost.title }}</div>
            <div v-if="detailPost.description" :class="$style.galleryDetailDesc">{{ detailPost.description }}</div>
            <div :class="$style.galleryDetailMeta">
              <div :class="$style.galleryDetailUser">
                <img
                  :src="detailPost.user.avatarUrl || '/avatar-default.svg'"
                  :class="$style.galleryUserAvatar"
                  @error="(e: Event) => (e.target as HTMLImageElement).src = '/avatar-error.svg'"
                />
                <span :class="$style.galleryUserName">{{ detailPost.user.name || detailPost.user.username }}</span>
              </div>
              <span :class="$style.galleryDetailDate">{{ formatDate(detailPost.createdAt) }}</span>
            </div>
            <div :class="$style.galleryDetailActions">
              <button
                class="_button"
                :class="[$style.galleryLikeBtn, { [$style.liked]: detailPost.isLiked }]"
                :disabled="liking"
                @click="toggleLike"
              >
                <i class="ti ti-heart" />
                <span v-if="detailPost.likedCount > 0">{{ detailPost.likedCount }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Grid view -->
    <template v-else>
      <div ref="galleryGridScrollRef" :class="$style.galleryGridScroll" @scroll.passive="onScroll">
        <div v-if="loading && posts.length === 0 && !isLoggedOut" :class="$style.columnLoading"><LoadingSpinner /></div>
        <ColumnEmptyState v-else-if="error && !isLoggedOut" :message="error" is-error :image-url="serverErrorImageUrl" />
        <ColumnEmptyState v-else-if="posts.length === 0" message="ギャラリーの投稿がありません" :image-url="serverInfoImageUrl" />
        <template v-else>
          <div :class="$style.galleryGrid">
            <button
              v-for="post in posts"
              :key="post.id"
              class="_button"
              :class="$style.galleryGridCell"
              @click="openDetail(post)"
            >
              <div :class="$style.galleryGridThumb">
                <img
                  v-if="post.files.length > 0 && isImage(post.files[0]!) && !post.isSensitive"
                  :src="safeUrl(post.files[0]!.thumbnailUrl) || safeUrl(post.files[0]!.url)"
                  :alt="post.title"
                  :class="$style.galleryGridImg"
                  loading="lazy"
                />
                <div v-else-if="post.isSensitive" :class="$style.galleryGridPlaceholder">
                  <i class="ti ti-eye-off" />
                </div>
                <div v-else :class="$style.galleryGridPlaceholder">
                  <i class="ti ti-photo" />
                </div>
                <div v-if="post.files.length > 1" :class="$style.galleryGridBadge">
                  <i class="ti ti-stack-2" />
                  {{ post.files.length }}
                </div>
              </div>
              <div :class="$style.galleryGridInfo">
                <div :class="$style.galleryGridTitle">{{ post.title }}</div>
                <div :class="$style.galleryGridFooter">
                  <span :class="$style.galleryGridUser">
                    <img
                      :src="post.user.avatarUrl || '/avatar-default.svg'"
                      :class="$style.galleryGridAvatar"
                      @error="(e: Event) => (e.target as HTMLImageElement).src = '/avatar-error.svg'"
                    />
                    {{ post.user.name || post.user.username }}
                  </span>
                  <span v-if="post.likedCount > 0" :class="$style.galleryGridLikes">
                    <i class="ti ti-heart" /> {{ post.likedCount }}
                  </span>
                </div>
              </div>
            </button>
          </div>
          <div v-if="loading" :class="$style.columnLoading"><LoadingSpinner /></div>
        </template>
      </div>
    </template>
  </DeckColumn>
</template>

<style lang="scss" module>
@use './column-common.module.scss';

/* --- Grid scroll --- */
.galleryGridScroll {
  position: relative;
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

/* --- Grid --- */
.galleryGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px;
  padding: 2px;
}

.galleryGridCell {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: opacity var(--nd-duration-base);
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: auto 160px;

  &:hover {
    opacity: 0.8;
  }
}

.galleryGridThumb {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--nd-bg);
}

.galleryGridImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.galleryGridPlaceholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  opacity: 0.3;
}

.galleryGridBadge {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--nd-overlayDark);
  color: #fff;
  font-size: 11px;
}

.galleryGridInfo {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.galleryGridTitle {
  font-size: 0.75em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.galleryGridFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.galleryGridUser {
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

.galleryGridAvatar {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}

.galleryGridLikes {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.65em;
  color: var(--nd-love);
  flex-shrink: 0;
}

/* --- Detail view --- */
.galleryDetailScroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.galleryDetail {
  display: flex;
  flex-direction: column;
}

.galleryDetailViewer {
  position: relative;
  background: var(--nd-bg);
}

.galleryViewerImage {
  aspect-ratio: 4 / 3;
  overflow: hidden;
}

.galleryDetailImg {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.galleryViewerPlaceholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 32px;
  opacity: 0.3;

  span {
    font-size: 14px;
  }
}

.galleryNavBtn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--nd-modalBg);
  color: #fff;
  font-size: 16px;
  transition: background var(--nd-duration-base);

  &:hover {
    background: rgba(0, 0, 0, 0.7);
  }
}

.galleryNavPrev {
  left: 8px;
}

.galleryNavNext {
  right: 8px;
}

.galleryDots {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
}

.galleryDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: background var(--nd-duration-base);

  &.active {
    background: #fff;
  }
}

/* --- Detail info --- */
.galleryDetailInfo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}

.galleryDetailTitle {
  font-size: 1em;
  font-weight: 700;
  color: var(--nd-fgHighlighted);
}

.galleryDetailDesc {
  font-size: 0.85em;
  color: var(--nd-fg);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.galleryDetailMeta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.galleryDetailUser {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.galleryUserAvatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
}

.galleryUserName {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.galleryDetailDate {
  font-size: 0.8em;
  opacity: 0.5;
  flex-shrink: 0;
}

.galleryDetailActions {
  display: flex;
  gap: 8px;
}

.galleryLikeBtn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--nd-radius-md);
  background: var(--nd-love-subtle);
  color: var(--nd-fg);
  font-size: 0.85em;
  font-weight: 600;
  transition: background var(--nd-duration-base), color var(--nd-duration-base);

  &:hover {
    background: color-mix(in srgb, var(--nd-love) 20%, transparent);
  }

  &.liked {
    color: var(--nd-love);
    background: var(--nd-love-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
</style>
