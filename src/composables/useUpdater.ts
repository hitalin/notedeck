import { ref } from 'vue'
import { useUiStore } from '@/stores/ui'

const updateAvailable = ref(false)
const updateVersion = ref('')
const isInstalling = ref(false)

let pendingUpdate: import('@tauri-apps/plugin-updater').Update | null = null
let checked = false

async function checkForUpdate() {
  if (checked || useUiStore().isMobile) return
  checked = true

  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (update) {
      pendingUpdate = update
      updateAvailable.value = true
      updateVersion.value = update.version
    }
  } catch (e) {
    console.warn('[updater] check failed:', e)
  }
}

async function installUpdate() {
  if (!pendingUpdate || isInstalling.value) return
  isInstalling.value = true

  try {
    await pendingUpdate.downloadAndInstall()
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  } catch (e) {
    console.error('[updater] install failed:', e)
    isInstalling.value = false
  }
}

export function useUpdater() {
  return {
    updateAvailable,
    updateVersion,
    isInstalling,
    checkForUpdate,
    installUpdate,
  }
}
