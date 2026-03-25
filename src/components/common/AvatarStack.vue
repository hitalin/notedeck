<script setup lang="ts">
import { computed } from 'vue'
import { getAccountAvatarUrl, useAccountsStore } from '@/stores/accounts'

const props = withDefaults(
  defineProps<{
    /** Max number of avatars to show */
    max?: number
    /** Avatar size in px */
    size?: number
    /** Custom users to display (overrides accounts) */
    users?: Array<{ avatarUrl: string | null; username: string }>
  }>(),
  {
    max: 3,
    size: 20,
    users: undefined,
  },
)

const accountsStore = useAccountsStore()

interface DisplayItem {
  key: string
  src: string
}

const displayItems = computed<DisplayItem[]>(() => {
  if (props.users) {
    return props.users.slice(0, props.max).map((u, i) => ({
      key: `${u.username}-${i}`,
      src: u.avatarUrl ?? '',
    }))
  }
  return accountsStore.accounts.slice(0, props.max).map((a) => ({
    key: a.id,
    src: getAccountAvatarUrl(a),
  }))
})

const overlapPx = computed(() => Math.round(props.size * 0.3))

const stackWidth = computed(() => {
  const count = displayItems.value.length
  if (count === 0) return 0
  return props.size + (count - 1) * (props.size - overlapPx.value)
})
</script>

<template>
  <div
    :class="$style.stack"
    :style="{ width: `${stackWidth}px`, height: `${size}px` }"
  >
    <img
      v-for="(item, i) in displayItems"
      :key="item.key"
      :src="item.src"
      :class="$style.avatar"
      :style="{
        width: `${size}px`,
        height: `${size}px`,
        left: `${i * (size - overlapPx)}px`,
        zIndex: displayItems.length - i,
      }"
    />
  </div>
</template>

<style lang="scss" module>
.stack {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.avatar {
  position: absolute;
  top: 0;
  border-radius: 50%;
  border: 1.5px solid var(--nd-panel, #fff);
  object-fit: cover;
}
</style>
