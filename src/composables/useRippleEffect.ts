import { shallowRef, triggerRef } from 'vue'

export interface RippleInstance {
  id: number
  x: number
  y: number
}

let _nextId = 0
const ripples = shallowRef<RippleInstance[]>([])

export function useRippleEffect() {
  function spawn(x: number, y: number) {
    const id = _nextId++
    ripples.value.push({ id, x, y })
    triggerRef(ripples)
  }

  function remove(id: number) {
    const idx = ripples.value.findIndex((r) => r.id === id)
    if (idx !== -1) {
      ripples.value.splice(idx, 1)
      triggerRef(ripples)
    }
  }

  return { ripples, spawn, remove }
}
