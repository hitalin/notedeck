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
const sensitiveRevealed = ref(false)
const playerExpanded = ref(false)
let observer: IntersectionObserver | null = null

/** Allowed origins for player iframes */
const PLAYER_ALLOWED_ORIGINS = [
  'youtube.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
  'open.spotify.com',
  'embed.nicovideo.jp',
  'platform.twitter.com',
  'bandcamp.com',
  'soundcloud.com',
]

const isPlayerAllowed = computed(() => {
  if (!data.value?.player?.url) return false
  try {
    const host = new URL(data.value.player.url).hostname
    return PLAYER_ALLOWED_ORIGINS.some(
      (o) => host === o || host.endsWith(`.${o}`),
    )
  } catch {
    return false
  }
})

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
  const targetUrl = data.value?.url || props.url
  if (isSafeUrl(targetUrl)) openUrl(targetUrl)
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
      <!-- Player embed (click thumbnail to expand) -->
      <div
        v-if="playerExpanded && data.player && isPlayerAllowed"
        class="url-preview-player"
      >
        <iframe
          :src="data.player.url"
          :width="data.player.width ?? 480"
          :height="data.player.height ?? 270"
          frameborder="0"
          :allow="data.player.allow.length ? data.player.allow.join('; ') : 'autoplay; encrypted-media'"
          sandbox="allow-scripts allow-same-origin allow-popups"
          allowfullscreen
        />
      </div>

      <!-- Thumbnail with sensitive overlay -->
      <div
        v-else-if="data.thumbnail && !imageError"
        class="url-preview-thumb-wrap"
        :class="{ 'is-sensitive': data.sensitive && !sensitiveRevealed }"
      >
        <img
          :src="proxyUrl(data.thumbnail) ?? data.thumbnail"
          class="url-preview-image"
          loading="lazy"
          decoding="async"
          @error="imageError = true"
          @click.stop="
            data.player && isPlayerAllowed
              ? (playerExpanded = true)
              : undefined
          "
        />
        <!-- Sensitive overlay -->
        <div
          v-if="data.sensitive && !sensitiveRevealed"
          class="sensitive-overlay"
          @click.stop="sensitiveRevealed = true"
        >
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path
              fill="currentColor"
              d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.804 11.804 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
            />
          </svg>
          <span>NSFW</span>
        </div>
        <!-- Play indicator for player-capable previews -->
        <div
          v-if="data.player && isPlayerAllowed && !data.sensitive"
          class="play-indicator"
          @click.stop="playerExpanded = true"
        >
          <svg viewBox="0 0 24 24" width="32" height="32">
            <path fill="currentColor" d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>

      <div class="url-preview-body">
        <div class="url-preview-title">{{ data.title }}</div>
        <div v-if="data.description" class="url-preview-description">
          {{ data.description }}
        </div>
        <div class="url-preview-host">
          <img
            v-if="data.icon"
            :src="data.icon"
            class="url-preview-favicon"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          {{ hostname(data.url || url) }}
        </div>
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

.url-preview:has(.url-preview-player) {
  flex-direction: column;
}

.url-preview:hover {
  background: var(--nd-buttonHoverBg);
}

.url-preview-thumb-wrap {
  position: relative;
  flex-shrink: 0;
  width: 100px;
  min-height: 80px;
}

.url-preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.url-preview-thumb-wrap.is-sensitive .url-preview-image {
  filter: blur(16px);
}

.sensitive-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 0.75em;
  font-weight: bold;
  cursor: pointer;
  backdrop-filter: blur(4px);
  z-index: 2;
}

.play-indicator {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.15s;
}

.play-indicator:hover {
  opacity: 1;
}

.url-preview-player {
  flex-shrink: 0;
  width: 100%;
}

.url-preview-player iframe {
  width: 100%;
  max-height: 300px;
  border: none;
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
  display: flex;
  align-items: center;
  gap: 4px;
}

.url-preview-favicon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
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
