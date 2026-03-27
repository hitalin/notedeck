import { ref } from 'vue'

export interface RippleInstance {
  id: number
  x: number
  y: number
}

let _nextId = 0
const ripples = ref<RippleInstance[]>([])

export function useRippleEffect() {
  function spawn(x: number, y: number) {
    const id = _nextId++
    ripples.value = [...ripples.value, { id, x, y }]
  }

  function remove(id: number) {
    ripples.value = ripples.value.filter((r) => r.id !== id)
  }

  return { ripples, spawn, remove }
}
