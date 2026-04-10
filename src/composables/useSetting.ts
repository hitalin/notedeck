/**
 * `useSetting` — v-model 互換のリアクティブアクセサを返す composable。
 *
 * useSettingsStore を直接使うより宣言的で、デフォルト値のフォールバックも
 * まとめて扱える。set() 側は store の debounced persist 経由で settings.json に
 * 書き戻される。
 *
 * @example
 * ```vue
 * <script setup>
 * import { useSetting } from '@/composables/useSetting'
 * const realtime = useSetting('modes.realtime', false)
 * </script>
 * <template>
 *   <input type="checkbox" v-model="realtime" />
 * </template>
 * ```
 */

import { computed, type WritableComputedRef } from 'vue'
import type { NotedeckSettings } from '@/settings/schema'
import { useSettingsStore } from '@/stores/settings'

export function useSetting<K extends keyof NotedeckSettings>(
  key: K,
  defaultValue: NonNullable<NotedeckSettings[K]>,
): WritableComputedRef<NonNullable<NotedeckSettings[K]>> {
  const store = useSettingsStore()
  return computed({
    get: () =>
      (store.get(key) ?? defaultValue) as NonNullable<NotedeckSettings[K]>,
    set: (v) => store.set(key, v),
  })
}
