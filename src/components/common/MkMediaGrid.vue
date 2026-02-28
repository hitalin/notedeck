<script setup lang="ts">
import { ref } from 'vue'
import type { NormalizedDriveFile } from '@/adapters/types'

defineProps<{
  files: NormalizedDriveFile[]
}>()

const revealedIds = ref(new Set<string>())
const lightboxFile = ref<NormalizedDriveFile | null>(null)

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

function isImage(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('image/')
}

function isVideo(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('video/')
}

function isAudio(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('audio/')
}
</script>

<template>
  <div class="media-grid" :class="`media-count-${Math.min(files.length, 4)}`">
    <div
      v-for="(file, idx) in files.slice(0, 4)"
      :key="file.id"
      class="media-cell"
      :class="{ 'is-sensitive': file.isSensitive && !revealedIds.has(file.id) }"
      @click="openLightbox(file, $event)"
    >
      <template v-if="isImage(file)">
        <img
          :src="file.thumbnailUrl || file.url"
          :alt="file.name"
          class="media-image"
          loading="lazy"
          decoding="async"
        />
      </template>
      <template v-else-if="isVideo(file)">
        <video
          :src="file.url"
          class="media-video"
          preload="metadata"
          @click.stop
        />
        <div class="media-badge">VIDEO</div>
      </template>
      <template v-else-if="isAudio(file)">
        <div class="media-audio-placeholder">
          <svg viewBox="0 0 24 24" width="32" height="32">
            <path d="M9 18V5l12-2v13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2" fill="none" />
            <circle cx="18" cy="16" r="3" stroke="currentColor" stroke-width="2" fill="none" />
          </svg>
          <span>{{ file.name }}</span>
        </div>
      </template>
      <template v-else>
        <div class="media-file-placeholder">
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" fill="none" />
            <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" fill="none" />
          </svg>
          <span>{{ file.name }}</span>
        </div>
      </template>

      <!-- NSFW overlay -->
      <div
        v-if="file.isSensitive && !revealedIds.has(file.id)"
        class="sensitive-overlay"
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

      <!-- "+N more" badge -->
      <div v-if="idx === 3 && files.length > 4" class="more-badge">
        +{{ files.length - 4 }}
      </div>
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
        :src="lightboxFile.url"
        :alt="lightboxFile.name"
        class="lightbox-image"
        @click.stop
      />
      <video
        v-else-if="isVideo(lightboxFile)"
        :src="lightboxFile.url"
        class="lightbox-video"
        controls
        autoplay
        @click.stop
      />
    </div>
  </Teleport>
</template>

<style scoped>
.media-grid {
  display: grid;
  gap: 4px;
  margin-top: 8px;
  border-radius: 8px;
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

.media-cell {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.05);
  min-height: 100px;
  max-height: 300px;
  aspect-ratio: 16 / 9;
  contain: layout;
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
}

.media-video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7em;
  font-weight: bold;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
}

.media-audio-placeholder,
.media-file-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  min-height: 80px;
  padding: 16px;
  color: var(--nd-fg);
  opacity: 0.6;
  font-size: 0.8em;
  text-align: center;
  word-break: break-all;
}

/* NSFW overlay */
.is-sensitive .media-image,
.is-sensitive .media-video {
  filter: blur(16px);
}

.sensitive-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  backdrop-filter: blur(4px);
}

.sensitive-hide-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
}

.sensitive-hide-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}

.more-badge {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  font-size: 1.4em;
  font-weight: bold;
}

/* Lightbox */
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  cursor: pointer;
}

.lightbox-close {
  position: absolute;
  top: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
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
</style>
