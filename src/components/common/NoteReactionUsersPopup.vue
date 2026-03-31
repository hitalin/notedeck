<script setup lang="ts">
import { defineAsyncComponent, ref, useTemplateRef } from 'vue'
import { useHoverPopup } from '@/composables/useHoverPopup'
import { usePortal } from '@/composables/usePortal'
import { extractThemeVars } from '@/utils/themeVars'

const MkReactionUsersPopup = defineAsyncComponent(
  () => import('./MkReactionUsersPopup.vue'),
)

defineProps<{
  noteId: string
  accountId: string
  serverHost: string
}>()

const emit = defineEmits<{
  openModal: [reaction: string]
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

const reactionUsersPortalRef = useTemplateRef<HTMLElement>(
  'reactionUsersPortalRef',
)
usePortal(reactionUsersPortalRef)

defineExpose({ show, hide })
</script>

<template>
  <div v-if="popup.isVisible.value" ref="reactionUsersPortalRef" :style="theme">
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
      @open-modal="(r: string) => { popup.forceClose(); emit('openModal', r) }"
    />
  </div>
</template>
