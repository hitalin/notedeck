<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import MkAd from '@/components/common/MkAd.vue'
import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useAds } from '@/composables/useAds'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const accountsStore = useAccountsStore()
const serversStore = useServersStore()

const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === props.column.accountId),
)

const { columnThemeVars } = useColumnTheme(() => props.column)

const serverIconUrl = ref<string | undefined>()
const isLoading = ref(false)
const scrollContainer = ref<HTMLElement | null>(null)

const { ads, serverHost, fetchAds, muteAd } = useAds(
  () => props.column.accountId ?? undefined,
)

function scrollToTop() {
  scrollContainer.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

async function load() {
  const acc = account.value
  if (!acc) return

  isLoading.value = true
  try {
    const info = await serversStore.getServerInfo(acc.host)
    serverIconUrl.value = info.iconUrl
    await fetchAds()
  } finally {
    isLoading.value = false
  }
}

function onMuteAd(adId: string) {
  muteAd(adId)
}

onMounted(() => {
  load()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? '広告'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop"
  >
    <template #header-icon>
      <i class="ti ti-ad-2 tl-header-icon" />
    </template>

    <template #header-meta>
      <button class="_button header-refresh" title="更新" :disabled="isLoading" @click.stop="load">
        <i class="ti ti-refresh" :class="{ 'spin': isLoading }" />
      </button>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img class="header-favicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="isLoading && ads.length === 0" class="ads-body">
      <MkSkeleton v-for="i in 3" :key="i" />
    </div>

    <div v-else-if="ads.length === 0" class="column-empty">
      広告はありません
    </div>

    <div v-else ref="scrollContainer" class="ads-body">
      <MkAd
        v-for="ad in ads"
        :key="ad.id"
        :ad="ad"
        :server-host="serverHost"
        @mute="onMuteAd"
      />
    </div>
  </DeckColumn>
</template>

<style scoped>
@import "./column-common.css";

.ads-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  -webkit-overflow-scrolling: touch;
}
</style>
