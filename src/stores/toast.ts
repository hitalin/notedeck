import { ref } from 'vue'

export interface ToastItem {
  id: number
  text: string
  type: 'success' | 'info' | 'warning' | 'error'
}

const toasts = ref<ToastItem[]>([])
let nextId = 0

const DURATION: Record<ToastItem['type'], number> = {
  success: 3000,
  info: 3000,
  warning: 4000,
  error: 5000,
}

export function useToast() {
  function show(text: string, type: ToastItem['type'] = 'info') {
    const id = nextId++
    toasts.value.push({ id, text, type })
    setTimeout(() => dismiss(id), DURATION[type])
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { toasts, show, dismiss }
}
