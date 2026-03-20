<script setup lang="ts">
import { computed, ref } from 'vue'
import { char2twemojiUrl } from '@/utils/twemoji'

const props = defineProps<{ emoji: string }>()
const url = computed(() => char2twemojiUrl(props.emoji))
const failed = ref(false)
</script>

<template>
  <img v-if="!failed" class="twemoji" :class="$style.twemoji" :src="url" :alt="emoji" width="20" height="20" decoding="async" loading="lazy" @error="failed = true" />
  <span v-else :class="$style.nativeEmoji">{{ emoji }}</span>
</template>

<style lang="scss" module>
.twemoji {
  height: 1.25em;
  vertical-align: -0.25em;
  object-fit: contain;
}

.nativeEmoji {
  font-size: 1.25em;
  line-height: 1;
  vertical-align: -0.15em;
}
</style>
