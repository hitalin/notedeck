import { ref } from 'vue'

const needsRefresh = ref(false)
let updateSW: ((reload?: boolean) => Promise<void>) | null = null

export function usePwa() {
  async function initPwa() {
    if (!('serviceWorker' in navigator)) return

    const { registerSW } = await import('virtual:pwa-register')
    updateSW = registerSW({
      onNeedRefresh() {
        needsRefresh.value = true
      },
    })
  }

  function applyUpdate() {
    updateSW?.(true)
    needsRefresh.value = false
  }

  function dismissUpdate() {
    needsRefresh.value = false
  }

  return {
    needsRefresh,
    initPwa,
    applyUpdate,
    dismissUpdate,
  }
}
