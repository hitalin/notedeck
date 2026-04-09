<script setup lang="ts">
import type { NormalizedDriveFile } from '@/adapters/types'
import {
  isAudio,
  isImage,
  isVideo,
  safeUrl,
} from '@/composables/useDriveFolder'

withDefaults(
  defineProps<{
    files: readonly NormalizedDriveFile[]
    selectMode?: boolean
    selectedIds?: Set<string> | null
    showLabel?: boolean
  }>(),
  {
    selectMode: false,
    selectedIds: null,
    showLabel: true,
  },
)

const emit = defineEmits<{
  'file-click': [file: NormalizedDriveFile]
}>()
</script>

<template>
  <div :class="$style.driveGrid">
    <slot />
    <button
      v-for="file in files"
      :key="file.id"
      class="_button"
      :class="[$style.driveGridCell, { [$style.selected]: selectMode && selectedIds?.has(file.id) }]"
      @click="emit('file-click', file)"
    >
      <div :class="$style.driveGridThumb">
        <img
          v-if="isImage(file) && !file.isSensitive"
          :src="safeUrl(file.thumbnailUrl) || safeUrl(file.url)"
          :alt="file.name"
          :class="$style.driveGridImg"
          loading="lazy"
        />
        <img
          v-else-if="isVideo(file) && !file.isSensitive && file.thumbnailUrl"
          :src="safeUrl(file.thumbnailUrl)"
          :alt="file.name"
          :class="$style.driveGridImg"
          loading="lazy"
        />
        <div v-else-if="file.isSensitive" :class="$style.driveGridPlaceholder">
          <i class="ti ti-eye-off" />
        </div>
        <div v-else :class="$style.driveGridPlaceholder">
          <i :class="isVideo(file) ? 'ti ti-video' : isAudio(file) ? 'ti ti-music' : 'ti ti-file'" />
        </div>
        <div v-if="isVideo(file) && !file.isSensitive" :class="$style.driveGridBadge">
          <i class="ti ti-player-play" />
        </div>
        <div v-if="selectMode" :class="[$style.driveSelectCheck, { [$style.checked]: selectedIds?.has(file.id) }]">
          <i class="ti ti-check" />
        </div>
      </div>
      <div v-if="showLabel" :class="$style.driveGridLabel">{{ file.name }}</div>
    </button>
  </div>
</template>

<style lang="scss" module>
.driveGrid {
  display: grid;
  grid-template-columns: var(--mk-file-grid-columns, repeat(2, 1fr));
  gap: 2px;
  padding: 2px;
}

.driveGridCell {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: opacity var(--nd-duration-base);
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: auto 120px;

  &:hover {
    opacity: 0.8;
  }
}

.driveGridThumb {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--nd-bg);
}

.driveGridImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.driveGridPlaceholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  opacity: 0.3;
}

.driveGridBadge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--nd-overlayDark);
  color: #fff;
  font-size: 12px;
}

.driveGridLabel {
  padding: 4px 6px;
  font-size: 0.65em;
  color: var(--nd-fg);
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.driveSelectCheck {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  font-size: 12px;
  transition: background var(--nd-duration-base), border-color var(--nd-duration-base), color var(--nd-duration-base);

  &.checked {
    background: var(--nd-accent);
    border-color: var(--nd-accent);
    color: #fff;
  }
}

.selected .driveGridThumb {
  outline: 3px solid var(--nd-accent);
  outline-offset: -3px;
}
</style>
