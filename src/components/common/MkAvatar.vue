<script setup lang="ts">
import { type CSSProperties, computed, ref, watch } from 'vue'
import type { AvatarDecoration } from '@/adapters/types'
import { useLazyImage } from '@/composables/useLazyImage'
import { proxyUrl } from '@/utils/imageProxy'

const props = withDefaults(
  defineProps<{
    avatarUrl: string | null
    decorations?: AvatarDecoration[]
    size?: number
    alt?: string
    indicator?: boolean
    onlineStatus?: 'online' | 'active' | 'offline' | 'unknown' | null
  }>(),
  {
    decorations: () => [],
    size: 58,
    alt: undefined,
    indicator: false,
    onlineStatus: null,
  },
)

defineEmits<{
  click: [event: MouseEvent]
  mouseenter: [event: MouseEvent]
  mouseleave: [event: MouseEvent]
}>()

const proxyFailed = ref(false)

watch(
  () => props.avatarUrl,
  () => {
    proxyFailed.value = false
  },
)

const avatarSrc = computed(() => {
  if (!props.avatarUrl) return undefined
  if (proxyFailed.value) return props.avatarUrl
  return proxyUrl(props.avatarUrl)
})

const { targetRef, lazySrc, isVisible } = useLazyImage(avatarSrc)

function onAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  if (!proxyFailed.value && img.src !== props.avatarUrl) {
    proxyFailed.value = true
  }
}

function computeDecorationStyle(d: AvatarDecoration): CSSProperties {
  const style: CSSProperties = {}
  const angle = d.angle ?? 0
  if (angle !== 0) style.rotate = `${angle * 360}deg`
  if (d.flipH) style.scale = '-1 1'
  const ox = d.offsetX ?? 0
  const oy = d.offsetY ?? 0
  if (ox !== 0 || oy !== 0) style.translate = `${ox * 100}% ${oy * 100}%`
  return style
}

const decorationStyles = computed(() =>
  props.decorations.map((d) => computeDecorationStyle(d)),
)
</script>

<template>
  <div
    ref="targetRef"
    class="mk-avatar"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    @click="$emit('click', $event)"
    @mouseenter="$emit('mouseenter', $event)"
    @mouseleave="$emit('mouseleave', $event)"
  >
    <img
      v-if="lazySrc"
      :key="props.avatarUrl ?? undefined"
      :src="lazySrc"
      :alt="props.alt"
      class="avatar-img"
      decoding="async"
      @error="onAvatarError"
    />
    <div v-else class="avatar-img avatar-placeholder" />
    <template v-if="isVisible">
      <img
        v-for="(d, i) in props.decorations"
        :key="d.id"
        :src="proxyUrl(d.url)"
        class="avatar-decoration"
        :style="decorationStyles[i]"
      />
    </template>
    <div
      v-if="indicator && onlineStatus"
      class="online-indicator"
      :class="`status-${onlineStatus}`"
    />
  </div>
</template>

<style scoped>
.mk-avatar {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--nd-buttonBg);
  transition: transform 0.2s ease;
}

.mk-avatar:hover {
  transform: scale(1.05);
}

.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-placeholder {
  background: var(--nd-buttonBg);
}

.avatar-decoration {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  pointer-events: none;
  z-index: 1;
}

.online-indicator {
  position: absolute;
  z-index: 2;
  bottom: 0;
  left: 0;
  width: 20%;
  height: 20%;
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--nd-panel, var(--nd-bg));
}

.online-indicator.status-online {
  background: #58d4c9;
}

.online-indicator.status-active {
  background: #e4bc48;
}

.online-indicator.status-offline {
  background: #ea5353;
}

.online-indicator.status-unknown {
  background: #888;
}
</style>
