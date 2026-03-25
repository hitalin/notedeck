<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { NormalizedDriveFile } from '@/adapters/types'
import { isSafeUrl } from '@/utils/url'

function safeMediaSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return isSafeUrl(url) ? url : undefined
}

const props = defineProps<{
  files: NormalizedDriveFile[]
  /** When true, load images eagerly (item is near viewport in virtual scroller) */
  eager?: boolean
}>()

const revealedIds = ref(new Set<string>())
const loadedIds = ref(new Set<string>())
const erroredIds = ref(new Set<string>())
const lightboxIndex = ref<number | null>(null)
const lightboxFile = computed(() =>
  lightboxIndex.value !== null
    ? (previewableFiles.value[lightboxIndex.value] ?? null)
    : null,
)

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

function onImageError(fileId: string) {
  const next = new Set(erroredIds.value)
  next.add(fileId)
  erroredIds.value = next
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
  const idx = previewableFiles.value.indexOf(file)
  if (idx >= 0) lightboxIndex.value = idx
}

function closeLightbox() {
  lightboxIndex.value = null
}

function prevImage() {
  if (lightboxIndex.value !== null && lightboxIndex.value > 0) {
    lightboxIndex.value--
  }
}

function nextImage() {
  if (
    lightboxIndex.value !== null &&
    lightboxIndex.value < previewableFiles.value.length - 1
  ) {
    lightboxIndex.value++
  }
}

function onLightboxKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    closeLightbox()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    prevImage()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    nextImage()
  }
}

watch(lightboxIndex, (v) => {
  if (v !== null) {
    document.addEventListener('keydown', onLightboxKeydown)
  } else {
    document.removeEventListener('keydown', onLightboxKeydown)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onLightboxKeydown)
})
</script>

<template>
  <!-- Banner: Audio files (outside grid, like Misskey's MkMediaBanner) -->
  <div v-for="file in audioFiles" :key="file.id" :class="$style.mediaBanner">
    <div v-if="file.isSensitive && !revealedIds.has(file.id)" :class="$style.bannerSensitive" @click="toggleSensitive(file, $event)">
      <svg viewBox="0 0 24 24" width="16" height="16">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
            stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <b>NSFW</b>
      <span>{{ file.name }}</span>
    </div>
    <div v-else :class="$style.bannerAudio">
      <audio controls preload="metadata" :class="$style.audioPlayer" @click.stop>
        <source :src="safeMediaSrc(file.url)">
      </audio>
      <span :class="$style.audioName">{{ file.name }}</span>
    </div>
  </div>

  <!-- Banner: Other files (download link, like Misskey's MkMediaBanner) -->
  <div v-for="file in otherFiles" :key="file.id" :class="$style.mediaBanner">
    <a :href="safeMediaSrc(file.url)" :download="file.name" :class="$style.bannerDownload" @click.stop>
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <b>{{ file.name }}</b>
    </a>
  </div>

  <!-- Grid: Previewable files only (image + video) -->
  <div v-if="previewableFiles.length > 0" :class="[$style.mediaGrid, $style[`mediaCount${previewableCount}`]]">
    <div
      v-for="file in previewableFiles"
      :key="file.id"
      :class="[$style.mediaCell, { [$style.isSensitive]: file.isSensitive && !revealedIds.has(file.id), [$style.isLoaded]: loadedIds.has(file.id) || erroredIds.has(file.id) }]"
      @click="openLightbox(file, $event)"
    >
      <template v-if="isImage(file)">
        <img
          v-if="!erroredIds.has(file.id)"
          :src="safeMediaSrc(file.thumbnailUrl) || safeMediaSrc(file.url)"
          :alt="file.name"
          :class="[$style.mediaImage, { [$style.isLoaded]: loadedIds.has(file.id) }]"
          :loading="props.eager ? 'eager' : 'lazy'"
          decoding="async"
          @load="onImageLoaded(file.id)"
          @error="onImageError(file.id)"
        />
        <div v-else :class="$style.mediaPlaceholder">
          <i class="ti ti-photo" />
        </div>
      </template>
      <template v-else-if="isVideo(file)">
        <video
          v-if="!erroredIds.has(file.id)"
          :src="safeMediaSrc(file.url)"
          :class="$style.mediaVideo"
          preload="metadata"
          controls
          @click.stop
          @error="onImageError(file.id)"
        />
        <div v-else :class="$style.mediaPlaceholder">
          <i class="ti ti-video" />
        </div>
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
        :class="$style.sensitiveHideBtn"
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
    <div v-if="lightboxFile" :class="$style.lightboxOverlay" @click="closeLightbox">
      <button :class="$style.lightboxClose" @click="closeLightbox">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>

      <!-- Prev button -->
      <button
        v-if="previewableFiles.length > 1 && lightboxIndex !== null && lightboxIndex > 0"
        :class="$style.lightboxNav"
        :style="{ left: '16px' }"
        @click.stop="prevImage()"
      >
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <!-- Next button -->
      <button
        v-if="previewableFiles.length > 1 && lightboxIndex !== null && lightboxIndex < previewableFiles.length - 1"
        :class="$style.lightboxNav"
        :style="{ right: '16px' }"
        @click.stop="nextImage()"
      >
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <img
        v-if="isImage(lightboxFile)"
        :src="safeMediaSrc(lightboxFile.url)"
        :alt="lightboxFile.name"
        :class="$style.lightboxImage"
        @click.stop
      />
      <video
        v-else-if="isVideo(lightboxFile)"
        :src="safeMediaSrc(lightboxFile.url)"
        :class="$style.lightboxVideo"
        controls
        autoplay
        @click.stop
      />

      <!-- Dot indicators -->
      <div v-if="previewableFiles.length > 1" :class="$style.lightboxDots" @click.stop>
        <button
          v-for="(_, i) in previewableFiles"
          :key="i"
          :class="[$style.lightboxDot, { [$style.lightboxDotActive]: i === lightboxIndex }]"
          @click="lightboxIndex = i"
        />
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" module>
/* Banner: Audio & Other files (like Misskey's MkMediaBanner) */
.mediaBanner {
  margin-top: 8px;
  border-radius: var(--nd-radius-md);
  overflow: hidden;
  border: 0.5px solid var(--nd-border, rgba(128, 128, 128, 0.2));
}

.bannerAudio {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
}

.audioPlayer {
  width: 100%;
  height: 32px;
}

.audioName {
  font-size: 0.75em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bannerSensitive {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #111;
  color: #fff;
  font-size: 0.8em;
  cursor: pointer;

  span {
    opacity: 0.7;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.bannerDownload {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 0.8em;
  color: var(--nd-fg);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;

  b {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    background: var(--nd-bg-hover, rgba(128, 128, 128, 0.1));
  }
}

/* Grid: Image + Video */
.mediaGrid {
  display: grid;
  gap: 8px;
  margin-top: 8px;
  border-radius: var(--nd-radius-md);
  overflow: hidden;
  contain: content;
}

.mediaCount1 {
  grid-template-columns: 1fr;

  > .mediaCell {
    max-height: 460px;
  }
}

.mediaCount2 {
  grid-template-columns: 1fr 1fr;
}

.mediaCount3 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;

  > .mediaCell:first-child {
    grid-row: 1 / 3;
  }
}

.mediaCount4 {
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
}

.mediaCountmany {
  grid-template-columns: 1fr 1fr;
}

.mediaCell {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  background: var(--nd-bg, rgba(0, 0, 0, 0.05));
  min-height: 100px;
  max-height: 300px;
  aspect-ratio: 16 / 9;
  contain: layout;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 25%, rgba(255, 255, 255, 0.08) 50%, transparent 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    z-index: 0;
  }

  &.isLoaded::before {
    display: none;
  }
}

.mediaImage {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  content-visibility: auto;
  opacity: 0;
  transition: opacity var(--nd-duration-slower);
  position: relative;
  z-index: 1;

  &.isLoaded {
    opacity: 1;
  }
}

.mediaVideo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mediaPlaceholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  opacity: 0.3;
  font-size: 2em;
}

/* NSFW overlay */
.isSensitive {
  .mediaImage,
  .mediaVideo {
    filter: blur(var(--nd-blur));
  }
}

.sensitiveHideBtn {
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

  &:hover {
    background: rgba(0, 0, 0, 0.7);
  }
}

/* Lightbox */
.lightboxOverlay {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-overlayLightbox);
  cursor: pointer;
}

.lightboxClose {
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

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
}

.lightboxImage {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  cursor: default;
  border-radius: 4px;
}

.lightboxVideo {
  max-width: 90vw;
  max-height: 90vh;
  cursor: default;
  border-radius: 4px;
}

.lightboxNav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
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
  z-index: 1;
  transition: background var(--nd-duration-base);

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
}

.lightboxDots {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 1;
}

.lightboxDot {
  width: 8px;
  height: 8px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  padding: 0;
  transition: background var(--nd-duration-base);

  &:hover {
    background: rgba(255, 255, 255, 0.7);
  }
}

.lightboxDotActive {
  background: #fff;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@container (max-width: 500px) {
  .mediaGrid {
    gap: 4px;
  }

  .mediaCell {
    min-height: 80px;
    max-height: 200px;
  }

  .mediaCount1 > .mediaCell {
    max-height: 300px;
  }
}
</style>
