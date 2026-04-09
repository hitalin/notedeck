<script setup lang="ts">
import { computed } from 'vue'
import { proxyUrl } from '@/utils/imageProxy'

const props = withDefaults(
  defineProps<{
    /** メッセージテキスト */
    message: string
    /** Misskey サーバーのカスタム画像 URL（infoImageUrl / notFoundImageUrl / serverErrorImageUrl） */
    imageUrl?: string
    /** エラー状態かどうか */
    isError?: boolean
    /** CTA ボタンのラベル */
    ctaLabel?: string
    /** CTA ボタンのアイコン（Tabler icon クラス名、例: 'ti-pencil'） */
    ctaIcon?: string
  }>(),
  {
    isError: false,
  },
)

const emit = defineEmits<{
  cta: []
}>()

const resolvedImageUrl = computed(() => proxyUrl(props.imageUrl))
</script>

<template>
  <div :class="[$style.root, isError && $style.error]">
    <img
      v-if="resolvedImageUrl"
      :src="resolvedImageUrl"
      :class="$style.image"
      alt=""
      loading="lazy"
      draggable="false"
    />
    <div :class="$style.message">{{ message }}</div>
    <button
      v-if="ctaLabel"
      :class="$style.cta"
      class="_button"
      @click="emit('cta')"
    >
      <i v-if="ctaIcon" :class="['ti', ctaIcon]" />
      {{ ctaLabel }}
    </button>
  </div>
</template>

<style lang="scss" module>
.root {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 2rem 1rem;
  flex: 1;
  min-height: 0;
  animation: empty-fade-in var(--nd-duration-slow) ease;
}

@keyframes empty-fade-in {
  from {
    opacity: 0;
    translate: 0 8px;
  }
  to {
    opacity: 1;
    translate: 0 0;
  }
}

.image {
  width: auto;
  height: auto;
  max-width: min(200px, 60%);
  max-height: 160px;
  object-fit: contain;
  opacity: 0.8;
  user-select: none;
  pointer-events: none;
}

.message {
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 0.85em;
  text-align: center;
  line-height: 1.5;
  padding: 0 1rem;
}

.error {
  .message {
    color: var(--nd-love);
    opacity: 1;
  }
}

.cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--nd-radius-full);
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgOnAccent);
  background: color-mix(in srgb, var(--nd-accent) 80%, transparent);
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.85;
  }
}
</style>
