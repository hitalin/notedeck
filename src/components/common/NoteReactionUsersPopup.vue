<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { useHoverPopup } from '@/composables/useHoverPopup'
import { extractThemeVars } from '@/utils/themeVars'

const MkReactionUsersPopup = defineAsyncComponent(
  () => import('./MkReactionUsersPopup.vue'),
)

defineProps<{
  noteId: string
  accountId: string
  serverHost: string
}>()

const popup = useHoverPopup({
  hideDelay: 300,
  hideGuardSelector: '.reaction-users-popup',
})

const reaction = ref('')
const reactionUrl = ref<string | null>(null)
const totalCount = ref(0)
const theme = ref<Record<string, string>>({})

function show(e: MouseEvent, r: string, url: string | null, count: number) {
  popup.cancelHide()
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  reaction.value = r
  reactionUrl.value = url
  totalCount.value = count
  const column = el.closest('.deck-column') as HTMLElement | null
  if (column) theme.value = extractThemeVars(column)
  popup.show({ x: rect.left, y: rect.bottom + 4 })
}

function hide() {
  popup.hide()
}

defineExpose({ show, hide })
</script>

<template>
  <Teleport to="body">
    <div v-if="popup.isVisible.value" :style="theme">
      <MkReactionUsersPopup
        :note-id="noteId"
        :account-id="accountId"
        :server-host="serverHost"
        :reaction="reaction"
        :reaction-url="reactionUrl"
        :total-count="totalCount"
        :x="popup.position.value.x"
        :y="popup.position.value.y"
        @close="popup.forceClose()"
      />
    </div>
  </Teleport>
</template>
