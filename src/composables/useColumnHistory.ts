import { computed, ref, watch } from 'vue'
import { useDeckStore } from '@/stores/deck'

const history = ref<string[]>([])
const cursor = ref(-1)
/** true while navigating via back/forward (suppresses recording) */
let navigating = false

const MAX_HISTORY = 100

export function useColumnHistory() {
  const deckStore = useDeckStore()

  // Record active column changes into history
  watch(
    () => deckStore.activeColumnId,
    (id) => {
      if (!id || navigating) return
      // Trim forward entries when user navigates to a new column after going back
      if (cursor.value < history.value.length - 1) {
        history.value = history.value.slice(0, cursor.value + 1)
      }
      // Avoid consecutive duplicates
      if (history.value[history.value.length - 1] === id) return
      history.value.push(id)
      if (history.value.length > MAX_HISTORY) {
        history.value = history.value.slice(-MAX_HISTORY)
      }
      cursor.value = history.value.length - 1
    },
    { immediate: true },
  )

  const canGoBack = computed(() => cursor.value > 0)
  const canGoForward = computed(() => cursor.value < history.value.length - 1)

  function goBack() {
    if (!canGoBack.value) return
    const id = history.value[cursor.value - 1]
    if (!id) return
    navigating = true
    cursor.value--
    deckStore.setActiveColumn(id)
    navigating = false
  }

  function goForward() {
    if (!canGoForward.value) return
    const id = history.value[cursor.value + 1]
    if (!id) return
    navigating = true
    cursor.value++
    deckStore.setActiveColumn(id)
    navigating = false
  }

  return { canGoBack, canGoForward, goBack, goForward }
}
