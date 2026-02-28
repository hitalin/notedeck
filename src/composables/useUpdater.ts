import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { ref } from 'vue'

const updateAvailable = ref(false)
const updateVersion = ref('')
const isInstalling = ref(false)
const dismissed = ref(false)

let pendingUpdate: Update | null = null
let checked = false

async function checkForUpdate() {
  if (checked) return
  checked = true

  try {
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
    await relaunch()
  } catch (e) {
    console.error('[updater] install failed:', e)
    isInstalling.value = false
  }
}

function dismiss() {
  dismissed.value = true
}

export function useUpdater() {
  return {
    updateAvailable,
    updateVersion,
    isInstalling,
    dismissed,
    checkForUpdate,
    installUpdate,
    dismiss,
  }
}
