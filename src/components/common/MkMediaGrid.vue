<script setup lang="ts">
import { computed, ref } from 'vue'
import type { NormalizedDriveFile } from '@/adapters/types'
import { isSafeUrl } from '@/utils/url'

function safeMediaSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return isSafeUrl(url) ? url : undefined
}

const props = defineProps<{
  files: NormalizedDriveFile[]
}>()

const revealedIds = ref(new Set<string>())
const loadedIds = ref(new Set<string>())
const lightboxFile = ref<NormalizedDriveFile | null>(null)

function isImage(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('image/')
}

function isVideo(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('video/')
}

function isAudio(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('audio/')
}

function isPreviewable(file: NormalizedDriveFile): boolean {
  return isImage(file) || isVideo(file)
}

const previewableFiles = computed(() => props.files.filter(isPreviewable))
const audioFiles = computed(() => props.files.filter(isAudio))
const otherFiles = computed(() =>
  props.files.filter((f) => !isPreviewable(f) && !isAudio(f)),
)
const previewableCount = computed(() => {
  const c = previewableFiles.value.length
  return c <= 4 ? c : 'many'
})

function onImageLoaded(fileId: string) {
  const next = new Set(loadedIds.value)
  next.add(fileId)
  loadedIds.value = next
}

function toggleSensitive(file: NormalizedDriveFile, e: Event) {
  e.stopPropagation()
  const next = new Set(revealedIds.value)
  if (next.has(file.id)) {
    next.delete(file.id)
  } else {
    next.add(file.id)
  }
  revealedIds.value = next
}

function openLightbox(file: NormalizedDriveFile, e: Event) {
  e.stopPropagation()
  if (file.isSensitive && !revealedIds.value.has(file.id)) return
  lightboxFile.value = file
}

function closeLightbox() {
  lightboxFile.value = null
}
</script>

<template>
  <!-- Banner: Audio files (outside grid, like Misskey's MkMediaBanner) -->
  <div v-for="file in audioFiles" :key="file.id" class="media-banner">
    <div v-if="file.isSensitive && !revealedIds.has(file.id)" class="banner-sensitive" @click="toggleSensitive(file, $event)">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
            stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <b>NSFW</b>
      <span>{{ file.name }}</span>
    </div>
    <div v-else class="banner-audio">
      <audio controls preload="metadata" class="audio-player" @click.stop>
        <source :src="safeMediaSrc(file.url)">
      </audio>
      <span class="audio-name">{{ file.name }}</span>
    </div>
  </div>

  <!-- Banner: Other files (download link, like Misskey's MkMediaBanner) -->
  <div v-for="file in otherFiles" :key="file.id" class="media-banner">
    <a :href="safeMediaSrc(file.url)" :download="file.name" class="banner-download" @click.stop>
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <b>{{ file.name }}</b>
    </a>
  </div>

  <!-- Grid: Previewable files only (image + video) -->
  <div v-if="previewableFiles.length > 0" class="media-grid" :class="`media-count-${previewableCount}`">
    <div
      v-for="file in previewableFiles"
      :key="file.id"
      class="media-cell"
      :class="{ 'is-sensitive': file.isSensitive && !revealedIds.has(file.id), 'is-loaded': loadedIds.has(file.id) }"
      @click="openLightbox(file, $event)"
    >
      <template v-if="isImage(file)">
        <img
          :src="safeMediaSrc(file.thumbnailUrl) || safeMediaSrc(file.url)"
          :alt="file.name"
          class="media-image"
          :class="{ 'is-loaded': loadedIds.has(file.id) }"
          loading="lazy"
          decoding="async"
          @load="onImageLoaded(file.id)"
        />
      </template>
      <template v-else-if="isVideo(file)">
        <video
          :src="safeMediaSrc(file.url)"
          class="media-video"
          preload="metadata"
          controls
          @click.stop
        />
      </template>

      <!-- NSFW overlay -->
      <div
        v-if="file.isSensitive && !revealedIds.has(file.id)"
        class="_sensitiveOverlay"
        @click.stop="toggleSensitive(file, $event)"
      >
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
              stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <span>NSFW</span>
      </div>

      <!-- Revealed: show hide button -->
      <button
        v-if="file.isSensitive && revealedIds.has(file.id)"
        class="sensitive-hide-btn"
        @click.stop="toggleSensitive(file, $event)"
      >
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" fill="none" />
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none" />
        </svg>
      </button>

    </div>
  </div>

  <!-- Lightbox -->
  <Teleport to="body">
    <div v-if="lightboxFile" class="lightbox-overlay" @click="closeLightbox">
      <button class="lightbox-close" @click="closeLightbox">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
      <img
        v-if="isImage(lightboxFile)"
        :src="safeMediaSrc(lightboxFile.url)"
        :alt="lightboxFile.name"
        class="lightbox-image"
        @click.stop
      />
      <video
        v-else-if="isVideo(lightboxFile)"
        :src="safeMediaSrc(lightboxFile.url)"
        class="lightbox-video"
        controls
        autoplay
        @click.stop
      />
    </div>
  </Teleport>
</template>

<style scoped>
/* Banner: Audio & Other files (like Misskey's MkMediaBanner) */
.media-banner {
  margin-top: 8px;
  border-radius: var(--nd-radius-md);
  overflow: hidden;
  border: 0.5px solid var(--nd-border, rgba(128, 128, 128, 0.2));
}

.banner-audio {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
}

.audio-player {
  width: 100%;
  height: 32px;
}

.audio-name {
  font-size: 0.75em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.banner-sensitive {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #111;
  color: #fff;
  font-size: 0.8em;
  cursor: pointer;
}

.banner-sensitive span {
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.banner-download {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 0.8em;
  color: var(--nd-fg);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
}

.banner-download b {
  overflow: hidden;
  text-overflow: ellipsis;
}

.banner-download:hover {
  background: var(--nd-bg-hover, rgba(128, 128, 128, 0.1));
}

/* Grid: Image + Video */
.media-grid {
  display: grid;
  gap: 8px;
  margin-top: 8px;
  border-radius: var(--nd-radius-md);
  overflow: hidden;
  contain: content;
}

.media-count-1 {
  grid-template-columns: 1fr;
}

.media-count-2 {
  grid-template-columns: 1fr 1fr;
}

.media-count-3 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.media-count-3 > .media-cell:first-child {
  grid-row: 1 / 3;
}

.media-count-4 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.media-count-many {
  grid-template-columns: 1fr 1fr;
}

.media-cell {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  background: var(--nd-bg, rgba(0, 0, 0, 0.05));
  min-height: 100px;
  max-height: 300px;
  aspect-ratio: 16 / 9;
  contain: layout;
}

.media-cell::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 25%, rgba(255, 255, 255, 0.08) 50%, transparent 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  z-index: 0;
}

.media-cell.is-loaded::before {
  display: none;
}

.media-count-1 > .media-cell {
  max-height: 460px;
}

.media-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  content-visibility: auto;
  opacity: 0;
  transition: opacity var(--nd-duration-slower);
  position: relative;
  z-index: 1;
}

.media-image.is-loaded {
  opacity: 1;
}

.media-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* NSFW overlay */
.is-sensitive .media-image,
.is-sensitive .media-video {
  filter: blur(var(--nd-blur));
}


.sensitive-hide-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-modalBg);
  color: #fff;
  cursor: pointer;
  z-index: 2;
  transition: background var(--nd-duration-base);
}

.sensitive-hide-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-overlayLightbox);
  cursor: pointer;
}

.lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  cursor: pointer;
  transition: background var(--nd-duration-base);
  z-index: 1;
}

.lightbox-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

.lightbox-image {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  cursor: default;
  border-radius: 4px;
}

.lightbox-video {
  max-width: 90vw;
  max-height: 90vh;
  cursor: default;
  border-radius: 4px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@container (max-width: 500px) {
  .media-grid {
    gap: 4px;
  }

  .media-cell {
    min-height: 80px;
    max-height: 200px;
  }

  .media-count-1 > .media-cell {
    max-height: 300px;
  }
}
</style>
