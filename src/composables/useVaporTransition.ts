import { computed, onScopeDispose, type Ref, ref, shallowRef, watch } from 'vue'

// ---------------------------------------------------------------------------
// useVaporTransition — single element show/hide with leave animation
// ---------------------------------------------------------------------------

interface VaporTransitionOptions {
  /** Duration of the leave animation in ms (enter uses CSS @keyframes, auto-plays on mount) */
  enterDuration?: number
  leaveDuration?: number
}

/**
 * Replaces `<Transition>` with a Vapor Mode compatible composable.
 *
 * - Enter: element mounts and CSS @keyframes plays automatically via a class.
 * - Leave: `leaving` becomes true (apply leave @keyframes), DOM removal is
 *   delayed by `leaveDuration` ms so the animation can complete.
 */
export function useVaporTransition(
  show: Ref<boolean>,
  options: VaporTransitionOptions = {},
) {
  const { enterDuration = 300, leaveDuration = 300 } = options
  const visible = ref(show.value)
  const entering = ref(false)
  const leaving = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(show, (val) => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    if (val) {
      leaving.value = false
      visible.value = true
      entering.value = true
      timer = setTimeout(() => {
        entering.value = false
        timer = null
      }, enterDuration)
    } else {
      entering.value = false
      leaving.value = true
      timer = setTimeout(() => {
        visible.value = false
        leaving.value = false
        timer = null
      }, leaveDuration)
    }
  })

  onScopeDispose(() => {
    if (timer != null) clearTimeout(timer)
  })

  return { visible, entering, leaving }
}

// ---------------------------------------------------------------------------
// useVaporTransitionSwitch — mode="out-in" replacement
// ---------------------------------------------------------------------------

interface VaporTransitionSwitchOptions {
  leaveDuration?: number
}

/**
 * Replaces `<Transition mode="out-in">` for switching between keyed views.
 *
 * When `source` changes, `leaving` becomes true for `leaveDuration` ms.
 * After the leave completes, `displayed` updates to the new value and
 * `leaving` resets to false (triggering the enter animation via CSS).
 */
export function useVaporTransitionSwitch<T>(
  source: Ref<T>,
  options: VaporTransitionSwitchOptions = {},
) {
  const { leaveDuration = 300 } = options
  const displayed = ref(source.value) as Ref<T>
  const leaving = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  watch(source, (val) => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    leaving.value = true
    timer = setTimeout(() => {
      displayed.value = val
      leaving.value = false
      timer = null
    }, leaveDuration)
  })

  onScopeDispose(() => {
    if (timer != null) clearTimeout(timer)
  })

  return { displayed, leaving }
}

// ---------------------------------------------------------------------------
// useVaporTransitionGroup — list enter/leave replacement
// ---------------------------------------------------------------------------

interface VaporTransitionGroupOptions {
  enterDuration?: number
  leaveDuration?: number
}

interface HasId {
  readonly id: string | number
}

/**
 * Replaces `<TransitionGroup>` for animated lists.
 *
 * - Newly added items get their ID in `enteringIds` for `enterDuration` ms.
 * - Removed items stay in `rendered` with their ID in `leavingIds` for
 *   `leaveDuration` ms, then disappear.
 */
export function useVaporTransitionGroup<T extends HasId>(
  source: Ref<T[]>,
  options: VaporTransitionGroupOptions = {},
) {
  const { enterDuration = 300, leaveDuration = 300 } = options
  const enteringIds = shallowRef<ReadonlySet<string | number>>(new Set())
  const leavingMap = shallowRef<ReadonlyMap<string | number, T>>(new Map())
  const _timers = new Set<ReturnType<typeof setTimeout>>()

  let prevItems = new Map<string | number, T>(
    source.value.map((i) => [i.id, i]),
  )

  const rendered = computed(() => {
    const result = [...source.value]
    for (const [, item] of leavingMap.value) {
      if (!source.value.some((i) => i.id === item.id)) {
        result.push(item)
      }
    }
    return result
  })

  watch(source, (newItems) => {
    const newIds = new Set(newItems.map((i) => i.id))

    // Detect newly added items
    const added = new Set<string | number>()
    for (const id of newIds) {
      if (!prevItems.has(id)) added.add(id)
    }
    if (added.size > 0) {
      const next = new Set(enteringIds.value)
      for (const id of added) next.add(id)
      enteringIds.value = next
      const ids = [...added]
      const timer = setTimeout(() => {
        _timers.delete(timer)
        const after = new Set(enteringIds.value)
        for (const id of ids) after.delete(id)
        enteringIds.value = after
      }, enterDuration)
      _timers.add(timer)
    }

    // Detect removed items — keep them in rendered for leave animation
    const removed = new Map<string | number, T>()
    for (const [id, item] of prevItems) {
      if (!newIds.has(id)) removed.set(id, item)
    }
    if (removed.size > 0) {
      const next = new Map(leavingMap.value)
      for (const [id, item] of removed) next.set(id, item)
      leavingMap.value = next
      const ids = [...removed.keys()]
      const timer = setTimeout(() => {
        _timers.delete(timer)
        const after = new Map(leavingMap.value)
        for (const id of ids) after.delete(id)
        leavingMap.value = after
      }, leaveDuration)
      _timers.add(timer)
    }

    prevItems = new Map(newItems.map((i) => [i.id, i]))
  })

  onScopeDispose(() => {
    for (const t of _timers) clearTimeout(t)
  })

  return {
    rendered,
    enteringIds,
    leavingIds: computed(() => new Set(leavingMap.value.keys())),
  }
}
