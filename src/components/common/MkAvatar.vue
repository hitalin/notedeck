<script setup lang="ts">
import { type CSSProperties, computed, ref, watch } from 'vue'
import type { AvatarDecoration } from '@/adapters/types'
import { useLazyImage } from '@/composables/useLazyImage'
import { proxyThumbUrl, proxyUrl } from '@/utils/imageProxy'

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

const emit = defineEmits<{
  click: [event: MouseEvent]
  mouseenter: [event: MouseEvent]
  mouseleave: [event: MouseEvent]
}>()

const AVATAR_DEFAULT = '/avatar-default.svg'

const proxyFailed = ref(false)
const allFailed = ref(false)

watch(
  () => props.avatarUrl,
  () => {
    proxyFailed.value = false
    allFailed.value = false
  },
)

const avatarSrc = computed(() => {
  if (!props.avatarUrl || allFailed.value) return AVATAR_DEFAULT
  if (proxyFailed.value) return props.avatarUrl
  // Request a thumbnail sized to 2x display size for HiDPI screens
  return proxyThumbUrl(props.avatarUrl, props.size * 2)
})

const { targetRef, lazySrc, isVisible } = useLazyImage(avatarSrc)

function onAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  if (!proxyFailed.value && img.src !== props.avatarUrl) {
    // Proxy failed → try direct URL
    proxyFailed.value = true
  } else if (!allFailed.value) {
    // Direct URL also failed → show default avatar
    allFailed.value = true
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
    :class="$style.mkAvatar"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    @click="emit('click', $event)"
    @mouseenter="emit('mouseenter', $event)"
    @mouseleave="emit('mouseleave', $event)"
  >
    <img
      v-if="lazySrc"
      :key="props.avatarUrl ?? undefined"
      :src="lazySrc"
      :alt="props.alt"
      :class="$style.avatarImg"
      decoding="async"
      @error="onAvatarError"
    />
    <div v-else :class="[$style.avatarImg, $style.avatarPlaceholder]" />
    <template v-if="isVisible">
      <img
        v-for="(d, i) in props.decorations"
        :key="d.id"
        :src="proxyUrl(d.url)"
        :class="$style.avatarDecoration"
        :style="decorationStyles[i]"
        loading="lazy"
        decoding="async"
      />
    </template>
    <div
      v-if="indicator && onlineStatus"
      :class="[$style.onlineIndicator, $style[`status-${onlineStatus}`]]"
    />
  </div>
</template>

<style lang="scss" module>
.mkAvatar {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--nd-buttonBg);
  transition: transform var(--nd-duration-slow) ease;

  &:hover {
    transform: scale(1.05);
  }
}

.avatarImg {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.avatarPlaceholder {
  background: var(--nd-buttonBg);
}

.avatarDecoration {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  pointer-events: none;
  z-index: 1;
}

.onlineIndicator {
  position: absolute;
  z-index: 2;
  bottom: 0;
  left: 0;
  width: 20%;
  height: 20%;
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--nd-panel, var(--nd-bg));
}

.status-online {
  background: var(--nd-statusOnline);
}

.status-active {
  background: var(--nd-statusActive);
}

.status-offline {
  background: var(--nd-statusOffline);
}

.status-unknown {
  background: var(--nd-statusUnknown);
}
</style>
