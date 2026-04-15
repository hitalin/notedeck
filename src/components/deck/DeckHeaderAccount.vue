<script setup lang="ts">
import { type Account, getAccountAvatarUrl } from '@/stores/accounts'

defineProps<{
  account: Account | null | undefined
  serverIconUrl?: string | null
}>()
</script>

<template>
  <div v-if="account" :class="$style.headerAccount">
    <img :src="getAccountAvatarUrl(account)" :class="$style.headerAvatar" />
    <img
      :class="$style.headerFavicon"
      :src="serverIconUrl || `https://${account.host}/favicon.ico`"
      :title="account.host"
    />
  </div>
</template>

<style lang="scss" module>
.headerAccount {
  composes: headerAccount from './column-common.module.scss';
}

.headerAvatar {
  composes: headerAvatar from './column-common.module.scss';
}

.headerFavicon {
  composes: headerFavicon from './column-common.module.scss';
}
</style>
