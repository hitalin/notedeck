<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { ref } from 'vue'
import type { ServerAd } from '@/adapters/types'
import { isSafeUrl } from '@/utils/url'

const props = defineProps<{
  ad: ServerAd
  serverHost: string
}>()

const emit = defineEmits<{
  mute: [adId: string]
}>()

const showMenu = ref(false)

function onClick() {
  if (props.ad.url && isSafeUrl(props.ad.url)) {
    openUrl(props.ad.url)
  }
}

function reduceFrequency() {
  emit('mute', props.ad.id)
  showMenu.value = false
}
</script>

<template>
  <div class="mk-ad">
    <div class="ad-wrapper">
      <a class="ad-link" @click.prevent="onClick">
        <img :src="ad.imageUrl" class="ad-image" loading="lazy" />
        <button class="ad-info-btn" @click.prevent.stop="showMenu = !showMenu">
          <i class="ti ti-info-circle ad-info-icon" />
        </button>
      </a>
      <div v-if="showMenu" class="ad-menu-overlay" @click.stop>
        <div class="ad-menu-source">Ads by {{ serverHost }}</div>
        <button class="ad-menu-reduce" @click="reduceFrequency">
          この広告の表示頻度を下げる
        </button>
        <button class="ad-menu-back" @click="showMenu = false">戻る</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mk-ad {
  text-align: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--nd-divider);
}

.ad-wrapper {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.ad-link {
  display: block;
  position: relative;
  cursor: pointer;
}

.ad-link:hover > .ad-image {
  filter: contrast(120%);
}

.ad-image {
  display: block;
  object-fit: contain;
  max-width: 100%;
  margin: auto;
  border-radius: 5px;
}

.ad-info-btn {
  position: absolute;
  top: 1px;
  right: 1px;
  display: grid;
  place-content: center;
  background: var(--nd-panel, var(--nd-bg));
  border: none;
  border-radius: 100%;
  padding: 2px;
  cursor: pointer;
}

.ad-info-icon {
  font-size: 14px;
  line-height: 17px;
  color: var(--nd-fg);
  opacity: 0.7;
}

.ad-menu-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: var(--nd-panel, var(--nd-bg));
  border: solid 1px var(--nd-divider);
  border-radius: 5px;
}

.ad-menu-source {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;
}

.ad-menu-reduce {
  display: inline-block;
  margin: 4px 0;
  padding: 8px 16px;
  border: none;
  border-radius: var(--nd-radius-full);
  background: var(--nd-accent);
  color: #fff;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: opacity 0.15s;
}

.ad-menu-reduce:hover {
  opacity: 0.85;
}

.ad-menu-back {
  padding: 4px 8px;
  border: none;
  background: none;
  color: var(--nd-accent);
  font-size: 0.85em;
  cursor: pointer;
}

.ad-menu-back:hover {
  text-decoration: underline;
}
</style>
