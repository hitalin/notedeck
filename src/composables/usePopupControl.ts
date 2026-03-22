import { type Ref, ref } from 'vue'

/**
 * Mutually-exclusive popup control.
 * Opening one popup automatically closes all others.
 */
export function usePopupControl() {
  const popups: Ref<boolean>[] = []

  /** Create and register a new popup ref. */
  function register(initial = false): Ref<boolean> {
    const r = ref(initial)
    popups.push(r)
    return r
  }

  /** Register an existing ref (e.g. from another composable). */
  function track(r: Ref<boolean>) {
    popups.push(r)
  }

  /** Close all popups except the given one. */
  function closeOthers(except?: Ref<boolean>) {
    for (const r of popups) {
      if (r !== except) r.value = false
    }
  }

  /** Toggle a popup and close all others. */
  function toggle(target: Ref<boolean>) {
    target.value = !target.value
    closeOthers(target)
  }

  /** Close all popups. */
  function closeAll() {
    closeOthers()
  }

  return { register, track, closeOthers, toggle, closeAll }
}
