<script setup lang="ts">
import { type CSSProperties, computed } from 'vue'
import type { AvatarDecoration } from '@/adapters/types'

const props = withDefaults(
  defineProps<{
    avatarUrl: string | null
    decorations?: AvatarDecoration[]
    size?: number
    alt?: string
  }>(),
  {
    decorations: () => [],
    size: 58,
    alt: undefined,
  },
)

defineEmits<{
  click: [event: MouseEvent]
  mouseenter: [event: MouseEvent]
  mouseleave: [event: MouseEvent]
}>()

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
    class="mk-avatar"
    :style="{ width: `${props.size}px`, height: `${props.size}px` }"
    @click="$emit('click', $event)"
    @mouseenter="$emit('mouseenter', $event)"
    @mouseleave="$emit('mouseleave', $event)"
  >
    <img
      v-if="props.avatarUrl"
      :src="props.avatarUrl"
      :alt="props.alt"
      class="avatar-img"
      loading="lazy"
      decoding="async"
    />
    <div v-else class="avatar-img avatar-placeholder" />
    <img
      v-for="(d, i) in props.decorations"
      :key="d.id"
      :src="d.url"
      class="avatar-decoration"
      :style="decorationStyles[i]"
    />
  </div>
</template>

<style scoped>
.mk-avatar {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
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
</style>
