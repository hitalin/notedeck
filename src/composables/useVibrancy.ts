import { invoke } from '@tauri-apps/api/core'
import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'nd-vibrancy'

/** Transparency percentage: 0 = off (opaque), 100 = max transparency */
const opacity = ref(0)
const initialized = ref(false)

const enabled = computed(() => opacity.value > 0)

function load() {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved != null) {
    const val = Number(saved)
    if (!Number.isNaN(val)) opacity.value = Math.max(0, Math.min(100, val))
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, String(opacity.value))
}

function applyCss(value: number) {
  const el = document.documentElement
  if (value === 0) {
    el.classList.remove('nd-vibrancy')
    el.style.removeProperty('--nd-vibrancy-alpha')
  } else {
    // alpha = how opaque the overlay is (1 = fully opaque, 0 = fully transparent)
    // Higher slider value = more transparent = lower alpha
    const alpha = 1 - value / 100
    el.classList.add('nd-vibrancy')
    el.style.setProperty('--nd-vibrancy-alpha', String(alpha))
  }
}

async function applyEffect(value: number) {
  applyCss(value)
  if (value === 0) {
    await invoke('clear_window_vibrancy').catch(() => {})
  } else {
    await invoke('set_window_vibrancy', { effect: 'auto' }).catch(() => {})
  }
}

export function useVibrancy() {
  if (!initialized.value) {
    initialized.value = true
    load()

    watch(opacity, async (val) => {
      persist()
      await applyEffect(val)
    })
  }

  function setOpacity(value: number) {
    opacity.value = Math.max(0, Math.min(100, Math.round(value)))
  }

  async function init() {
    if (opacity.value > 0) {
      await applyEffect(opacity.value)
    }
  }

  return { enabled, opacity, setOpacity, init }
}
