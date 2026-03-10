<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import type { ServerAd } from '@/adapters/types'
import { isSafeUrl } from '@/utils/url'

const props = defineProps<{
  ad: ServerAd
}>()

function onClick() {
  if (props.ad.url && isSafeUrl(props.ad.url)) {
    openUrl(props.ad.url)
  }
}
</script>

<template>
  <div class="mk-ad" @click="onClick">
    <div class="ad-label">AD</div>
    <img :src="ad.imageUrl" class="ad-image" loading="lazy" />
    <div v-if="ad.memo" class="ad-memo">{{ ad.memo }}</div>
  </div>
</template>

<style scoped>
.mk-ad {
  padding: 12px 16px;
  border-bottom: 1px solid var(--nd-divider);
  cursor: pointer;
  transition: background 0.15s;
}

.mk-ad:hover {
  background: var(--nd-buttonHoverBg);
}

.ad-label {
  display: inline-block;
  padding: 1px 6px;
  margin-bottom: 8px;
  border-radius: 4px;
  font-size: 0.7em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.5;
  background: var(--nd-buttonBg);
  letter-spacing: 0.05em;
}

.ad-image {
  width: 100%;
  border-radius: 8px;
  object-fit: cover;
  display: block;
}

.ad-memo {
  margin-top: 6px;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.6;
}
</style>
