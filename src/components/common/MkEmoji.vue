<script setup lang="ts">
import { computed } from 'vue'
import { char2twemojiUrl } from '@/utils/twemoji'

const props = defineProps<{ emoji: string }>()
const url = computed(() => char2twemojiUrl(props.emoji))
</script>

<template>
  <img class="twemoji" :src="url" :alt="emoji" decoding="async" loading="lazy" />
</template>

<style scoped>
.twemoji {
  height: 1.25em;
  vertical-align: -0.25em;
  object-fit: contain;
}
</style>
