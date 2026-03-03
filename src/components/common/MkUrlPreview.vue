<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useOgpPreview } from '@/composables/useOgpPreview'
import { proxyUrl } from '@/utils/imageProxy'
import { isSafeUrl } from '@/utils/url'

const props = defineProps<{
  url: string
  accountId?: string
}>()

const mediaExtRe =
  /\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mov|mp3|ogg|wav)(\?.*)?$/i

const shouldPreview = computed(() => {
  if (!isSafeUrl(props.url)) return false
  if (mediaExtRe.test(props.url)) return false
  return true
})

const { data, loading, fetch } = useOgpPreview(props.url, props.accountId)
const el = ref<HTMLElement | null>(null)
const imageError = ref(false)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (!shouldPreview.value || !el.value) return
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) {
        observer?.disconnect()
        observer = null
        fetch()
      }
    },
    { rootMargin: '600px' },
  )
  observer.observe(el.value)
})

onUnmounted(() => {
  observer?.disconnect()
})

function handleClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (isSafeUrl(props.url)) openUrl(props.url)
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}
</script>

<template>
  <div v-if="shouldPreview" ref="el" class="url-preview" @click="handleClick">
    <div v-if="loading" class="url-preview-skeleton">
      <div class="skeleton-text">
        <div class="skeleton-line" style="width: 60%" />
        <div class="skeleton-line" style="width: 80%" />
      </div>
    </div>

    <template v-else-if="data?.title">
      <img
        v-if="data.image && !imageError"
        :src="proxyUrl(data.image) ?? data.image"
        class="url-preview-image"
        loading="lazy"
        decoding="async"
        @error="imageError = true"
      />
      <div class="url-preview-body">
        <div class="url-preview-title">{{ data.title }}</div>
        <div v-if="data.description" class="url-preview-description">
          {{ data.description }}
        </div>
        <div class="url-preview-host">{{ hostname(url) }}</div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.url-preview {
  display: flex;
  border: 1px solid var(--nd-divider);
  border-radius: 8px;
  overflow: hidden;
  margin-top: 8px;
  cursor: pointer;
  background: var(--nd-panelHighlight);
  max-width: 100%;
}

.url-preview:hover {
  background: var(--nd-buttonHoverBg);
}

.url-preview-image {
  width: 100px;
  min-height: 80px;
  object-fit: cover;
  flex-shrink: 0;
}

.url-preview-body {
  padding: 8px 12px;
  min-width: 0;
  flex: 1;
}

.url-preview-title {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--nd-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.url-preview-description {
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.7;
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.url-preview-host {
  font-size: 0.75em;
  color: var(--nd-fg);
  opacity: 0.5;
  margin-top: 4px;
}

.url-preview-skeleton {
  padding: 8px 12px;
  width: 100%;
}

.skeleton-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skeleton-line {
  height: 10px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--nd-buttonBg) 25%,
    var(--nd-panelHighlight) 50%,
    var(--nd-buttonBg) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
</style>
